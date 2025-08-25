import { Client } from '@opensearch-project/opensearch';
import { Article } from './database';

interface SearchResult {
  id: string;
  title: string;
  summary: string;
  content?: string;
  source_url: string;
  newsletter_source: string;
  published_date: string;
  score: number;
}

class OpenSearchService {
  private client: Client;
  private indexName = 'tldr_articles';
  private isConnected = false;

  constructor() {
    this.client = new Client({
      node: process.env.OPENSEARCH_URL || 'http://localhost:9201',
      ssl: {
        rejectUnauthorized: false
      }
    });
    this.initialize();
  }

  private async initialize(): Promise<void> {
    try {
      // Test connection
      const health = await this.client.cluster.health();
      console.log('✅ OpenSearch connected:', health.body.status);
      this.isConnected = true;

      // Create index if it doesn't exist
      await this.createIndexIfNotExists();
    } catch (error) {
      console.error('❌ OpenSearch connection failed:', error);
      console.log('💡 Falling back to PostgreSQL search only');
      this.isConnected = false;
    }
  }

  private async createIndexIfNotExists(): Promise<void> {
    try {
      const exists = await this.client.indices.exists({
        index: this.indexName
      });

      if (!exists.body) {
        console.log('🔧 Creating OpenSearch index...');
        await this.client.indices.create({
          index: this.indexName,
          body: {
            settings: {
              index: {
                "knn": true,
                "knn.algo_param.ef_search": 100
              }
            },
            mappings: {
              properties: {
                title: { 
                  type: 'text', 
                  analyzer: 'standard',
                  fields: {
                    keyword: { type: 'keyword' }
                  }
                },
                summary: { 
                  type: 'text', 
                  analyzer: 'standard' 
                },
                content: { 
                  type: 'text', 
                  analyzer: 'standard' 
                },
                source_url: { type: 'keyword' },
                newsletter_source: { type: 'keyword' },
                published_date: { type: 'date' },
                created_at: { type: 'date' },
                title_embedding: {
                  type: 'knn_vector',
                  dimension: 384,
                  method: {
                    name: 'hnsw',
                    space_type: 'cosinesimil',
                    engine: 'lucene'
                  }
                },
                summary_embedding: {
                  type: 'knn_vector',
                  dimension: 384,
                  method: {
                    name: 'hnsw',
                    space_type: 'cosinesimil',
                    engine: 'lucene'
                  }
                },
                content_embedding: {
                  type: 'knn_vector',
                  dimension: 384,
                  method: {
                    name: 'hnsw',
                    space_type: 'cosinesimil',
                    engine: 'lucene'
                  }
                }
              }
            }
          }
        });
        console.log('✅ OpenSearch index created with KNN support');
      }
    } catch (error) {
      console.error('❌ Failed to create OpenSearch index:', error);
    }
  }

  async indexArticle(article: Article, embeddings?: {
    title_embedding?: number[];
    summary_embedding?: number[];
    content_embedding?: number[];
  }): Promise<void> {
    if (!this.isConnected) return;

    try {
      await this.client.index({
        index: this.indexName,
        id: article.id,
        body: {
          title: article.title,
          summary: article.summary,
          content: article.content,
          source_url: article.source_url,
          newsletter_source: article.newsletter_source,
          published_date: article.published_date,
          created_at: article.created_at,
          title_embedding: embeddings?.title_embedding,
          summary_embedding: embeddings?.summary_embedding,
          content_embedding: embeddings?.content_embedding
        }
      });
    } catch (error) {
      console.error('❌ Failed to index article in OpenSearch:', error);
    }
  }

  async searchArticles(query: string, limit: number = 5): Promise<SearchResult[]> {
    if (!this.isConnected) {
      console.log('⚠️ OpenSearch not available, skipping search');
      return [];
    }

    try {
      const searchBody = {
        query: {
          multi_match: {
            query: query,
            fields: ['title^3', 'summary^2', 'content'],
            type: 'best_fields',
            fuzziness: 'AUTO'
          }
        },
        size: limit,
        sort: [
          { _score: { order: 'desc' } },
          { published_date: { order: 'desc' } }
        ]
      };

      console.log(`🔍 OpenSearch query: "${query}"`);

      const response = await this.client.search({
        index: this.indexName,
        body: searchBody
      });

      const hits = response.body.hits.hits;
      console.log(`📄 OpenSearch found ${hits.length} articles`);

      const results = hits.map((hit: any) => ({
        id: hit._id,
        title: hit._source.title,
        summary: hit._source.summary,
        content: hit._source.content,
        source_url: hit._source.source_url,
        newsletter_source: hit._source.newsletter_source,
        published_date: hit._source.published_date,
        score: hit._score
      }));

      // Log found articles for debugging
      if (results.length > 0) {
        console.log('📄 OpenSearch found articles:');
        results.forEach(article => {
          console.log(`  - ${article.title} (score: ${article.score.toFixed(2)})`);
        });
      }

      return results;
    } catch (error) {
      console.error('❌ OpenSearch search failed:', error);
      return [];
    }
  }

  async vectorSearch(embedding: number[], limit: number = 5): Promise<SearchResult[]> {
    if (!this.isConnected) {
      return [];
    }

    try {
      const searchBody = {
        size: limit,
        query: {
          knn: {
            summary_embedding: {
              vector: embedding,
              k: limit
            }
          }
        }
      };

      console.log(`🔍 OpenSearch vector search with ${embedding.length} dimensional embedding`);

      const response = await this.client.search({
        index: this.indexName,
        body: searchBody
      });

      const hits = response.body.hits.hits;
      console.log(`📄 Vector search found ${hits.length} articles`);

      return hits.map((hit: any) => ({
        id: hit._id,
        title: hit._source.title,
        summary: hit._source.summary,
        content: hit._source.content,
        source_url: hit._source.source_url,
        newsletter_source: hit._source.newsletter_source,
        published_date: hit._source.published_date,
        score: hit._score
      }));
    } catch (error) {
      console.error('❌ Vector search failed:', error);
      return [];
    }
  }

  async syncFromDatabase(): Promise<void> {
    if (!this.isConnected) return;

    console.log('🔄 Syncing articles from PostgreSQL to OpenSearch...');
    
    try {
      const { db } = await import('./database');
      const result = await db.getArticles(1000, 0); // Get all articles
      
      console.log(`📚 Found ${result.articles.length} articles to sync`);

      for (const article of result.articles) {
        await this.indexArticle(article);
      }

      console.log('✅ OpenSearch sync completed');
    } catch (error) {
      console.error('❌ Failed to sync articles to OpenSearch:', error);
    }
  }

  getStatus() {
    return {
      connected: this.isConnected,
      url: process.env.OPENSEARCH_URL || 'http://localhost:9201',
      index: this.indexName
    };
  }
}

export const openSearchService = new OpenSearchService();
export default openSearchService;