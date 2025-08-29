import { Pool, PoolClient } from 'pg';
import dotenv from 'dotenv';

dotenv.config();

// Database configuration
const dbConfig = {
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '5432'),
  database: process.env.DB_NAME || 'tldr_dev',
  user: process.env.DB_USER || 'tldr_user',
  password: process.env.DB_PASSWORD || 'tldr_password',
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
};

// Create connection pool
const pool = new Pool(dbConfig);

// Test connection on startup
pool.on('connect', () => {
  console.log('✅ Connected to PostgreSQL database');
});

pool.on('error', (err) => {
  console.error('❌ PostgreSQL connection error:', err);
});

// Article interface
export interface Article {
  id: string;
  title: string;
  summary: string;
  content?: string;
  source_url: string;
  newsletter_source: string;
  published_date: string;
  created_at: string;
  updated_at: string;
  title_embedding?: number[];
  summary_embedding?: number[];
  content_embedding?: number[];
  expires_at: string;
}

export interface CreateArticleData {
  title: string;
  summary: string;
  content?: string;
  source_url: string;
  newsletter_source: string;
  published_date: string;
  title_embedding?: number[];
  summary_embedding?: number[];
  content_embedding?: number[];
}

export class DatabaseService {
  private pool: Pool;

  constructor() {
    this.pool = pool;
  }

  // Test database connection
  async testConnection(): Promise<boolean> {
    try {
      const client = await this.pool.connect();
      const result = await client.query('SELECT NOW()');
      client.release();
      console.log('✅ Database connection test successful:', result.rows[0]);
      return true;
    } catch (error) {
      console.error('❌ Database connection test failed:', error);
      return false;
    }
  }

  // Get all articles with pagination
  async getArticles(limit: number = 10, offset: number = 0): Promise<{ articles: Article[], total: number }> {
    try {
      // Get total count - only today's tech and AI articles
      const countResult = await this.pool.query(`
        SELECT COUNT(*) FROM articles 
        WHERE expires_at > NOW()
        AND DATE(published_date) = CURRENT_DATE
        AND newsletter_source IN ('tldr_tech', 'tldr_ai')
      `);
      const total = parseInt(countResult.rows[0].count);

      // Get articles - only today's tech and AI articles
      const result = await this.pool.query(`
        SELECT id, title, summary, content, source_url, newsletter_source, 
               published_date, created_at, updated_at, expires_at
        FROM articles 
        WHERE expires_at > NOW()
        AND DATE(published_date) = CURRENT_DATE
        AND newsletter_source IN ('tldr_tech', 'tldr_ai')
        ORDER BY published_date DESC 
        LIMIT $1 OFFSET $2
      `, [limit, offset]);

      return {
        articles: result.rows,
        total
      };
    } catch (error) {
      console.error('❌ Error fetching articles:', error);
      throw new Error('Failed to fetch articles');
    }
  }

  // Get single article by ID
  async getArticleById(id: string): Promise<Article | null> {
    try {
      const result = await this.pool.query(`
        SELECT id, title, summary, content, source_url, newsletter_source,
               published_date, created_at, updated_at, expires_at
        FROM articles 
        WHERE id = $1 AND expires_at > NOW()
      `, [id]);

      return result.rows[0] || null;
    } catch (error) {
      console.error('❌ Error fetching article by ID:', error);
      throw new Error('Failed to fetch article');
    }
  }

  // Search articles by text
  async searchArticles(query: string): Promise<Article[]> {
    try {
      // Split query into individual words for better matching
      const words = query.toLowerCase().split(' ').filter(word => word.length > 2);
      const searchConditions = words.map(word => `(title ILIKE ${words.indexOf(word) + 2} OR summary ILIKE ${words.indexOf(word) + 2} OR content ILIKE ${words.indexOf(word) + 2})`);
      
      const result = await this.pool.query(`
        SELECT id, title, summary, content, source_url, newsletter_source,
               published_date, created_at, updated_at, expires_at
        FROM articles 
        WHERE expires_at > NOW()
        AND (${searchConditions.join(' OR ')})
        ORDER BY published_date DESC
        LIMIT 10
      `, [query, ...words.map(word => `%${word}%`)]);

      console.log(`🔍 Search for "${query}" found ${result.rows.length} articles`);
      return result.rows;
    } catch (error) {
      console.error('❌ Error searching articles:', error);
      // Fallback to simple search
      const result = await this.pool.query(`
        SELECT id, title, summary, content, source_url, newsletter_source,
               published_date, created_at, updated_at, expires_at
        FROM articles 
        WHERE expires_at > NOW()
        AND (
          title ILIKE $1 OR 
          summary ILIKE $1 OR 
          content ILIKE $1
        )
        ORDER BY published_date DESC
        LIMIT 10
      `, [`%${query}%`]);
      
      console.log(`🔍 Fallback search for "${query}" found ${result.rows.length} articles`);
      return result.rows;
    }
  }

  // Vector similarity search (placeholder for now)
  async vectorSearchArticles(embedding: number[], limit: number = 5): Promise<Article[]> {
    try {
      // For now, return recent articles until we implement embeddings
      const result = await this.pool.query(`
        SELECT id, title, summary, content, source_url, newsletter_source,
               published_date, created_at, updated_at, expires_at
        FROM articles 
        WHERE expires_at > NOW()
        ORDER BY published_date DESC 
        LIMIT $1
      `, [limit]);

      return result.rows;
    } catch (error) {
      console.error('❌ Error in vector search:', error);
      throw new Error('Failed to perform vector search');
    }
  }

  // Create new article
  async createArticle(data: CreateArticleData): Promise<Article> {
    try {
      const result = await this.pool.query(`
        INSERT INTO articles (
          title, summary, content, source_url, newsletter_source, published_date,
          title_embedding, summary_embedding, content_embedding
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
        ON CONFLICT (source_url) DO NOTHING
        RETURNING *
      `, [
        data.title,
        data.summary,
        data.content,
        data.source_url,
        data.newsletter_source,
        data.published_date,
        data.title_embedding ? JSON.stringify(data.title_embedding) : null,
        data.summary_embedding ? JSON.stringify(data.summary_embedding) : null,
        data.content_embedding ? JSON.stringify(data.content_embedding) : null,
      ]);

      if (result.rows.length === 0) {
        // Article already exists, fetch it
        const existingResult = await this.pool.query(
          'SELECT * FROM articles WHERE source_url = $1',
          [data.source_url]
        );
        
        if (existingResult.rows.length > 0) {
          console.log(`📝 Article already exists: ${data.title.substring(0, 50)}...`);
          return existingResult.rows[0];
        } else {
          throw new Error('Article insertion failed for unknown reason');
        }
      }

      return result.rows[0];
    } catch (error) {
      console.error('❌ Error creating article:', error);
      throw new Error('Failed to create article');
    }
  }

  // Update article embeddings
  async updateArticleEmbeddings(id: string, embeddings: {
    title_embedding?: number[];
    summary_embedding?: number[];
    content_embedding?: number[];
  }): Promise<void> {
    try {
      await this.pool.query(`
        UPDATE articles 
        SET 
          title_embedding = COALESCE($2, title_embedding),
          summary_embedding = COALESCE($3, summary_embedding),
          content_embedding = COALESCE($4, content_embedding),
          updated_at = CURRENT_TIMESTAMP
        WHERE id = $1
      `, [
        id,
        embeddings.title_embedding ? JSON.stringify(embeddings.title_embedding) : null,
        embeddings.summary_embedding ? JSON.stringify(embeddings.summary_embedding) : null,
        embeddings.content_embedding ? JSON.stringify(embeddings.content_embedding) : null,
      ]);
    } catch (error) {
      console.error('❌ Error updating article embeddings:', error);
      throw new Error('Failed to update article embeddings');
    }
  }

  // Clean up expired articles
  async cleanupExpiredArticles(): Promise<number> {
    try {
      const result = await this.pool.query('DELETE FROM articles WHERE expires_at <= NOW()');
      const deletedCount = result.rowCount || 0;
      console.log(`🧹 Cleaned up ${deletedCount} expired articles`);
      return deletedCount;
    } catch (error) {
      console.error('❌ Error cleaning up expired articles:', error);
      throw new Error('Failed to cleanup expired articles');
    }
  }

  // Get articles by newsletter source
  async getArticlesBySource(newsletterSource: string, limit: number = 10): Promise<Article[]> {
    try {
      const result = await this.pool.query(`
        SELECT id, title, summary, content, source_url, newsletter_source,
               published_date, created_at, updated_at, expires_at
        FROM articles 
        WHERE newsletter_source = $1 AND expires_at > NOW()
        ORDER BY published_date DESC 
        LIMIT $2
      `, [newsletterSource, limit]);

      return result.rows;
    } catch (error) {
      console.error('❌ Error fetching articles by source:', error);
      throw new Error('Failed to fetch articles by source');
    }
  }

  // Close database connection
  async close(): Promise<void> {
    await this.pool.end();
    console.log('📴 Database connection closed');
  }
}

// Create singleton instance
export const db = new DatabaseService();

// Test connection on module load
db.testConnection();

export default db;