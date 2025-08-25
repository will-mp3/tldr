// @ts-ignore - Ignore TypeScript issues with Xenova transformers
import { pipeline } from '@xenova/transformers';

interface EmbeddingResult {
  embedding: number[];
  tokens: number;
  processing_time: number;
}

class EmbeddingsService {
  private pipeline: any = null; // Use 'any' to avoid TypeScript issues
  private modelName = 'Xenova/all-MiniLM-L6-v2';
  private isLoading = false;
  private initializationPromise: Promise<void> | null = null;

  constructor() {
    // Don't initialize immediately, wait for first use
  }

  private async initializePipeline(): Promise<void> {
    if (this.pipeline) return; // Already loaded
    
    if (this.initializationPromise) {
      await this.initializationPromise;
      return;
    }

    this.initializationPromise = this.doInitialization();
    await this.initializationPromise;
  }

  private async doInitialization(): Promise<void> {
    if (this.isLoading || this.pipeline) return;
    
    this.isLoading = true;
    try {
      console.log('🔄 Loading Xenova embeddings model...');
      console.log('📦 This may take a moment on first run (downloading model)...');
      
      this.pipeline = await pipeline('feature-extraction', this.modelName);
      console.log('✅ Xenova embeddings model loaded successfully');
    } catch (error) {
      console.error('❌ Failed to load Xenova embeddings model:', error);
      this.pipeline = null;
      throw new Error(`Failed to initialize embeddings service: ${error}`);
    } finally {
      this.isLoading = false;
    }
  }

  async generateEmbedding(text: string): Promise<EmbeddingResult> {
    const startTime = Date.now();
    
    try {
      // Ensure pipeline is loaded
      await this.initializePipeline();

      if (!this.pipeline) {
        throw new Error('Embeddings pipeline failed to initialize');
      }

      // Clean and truncate text (model has token limits)
      const cleanText = this.preprocessText(text);
      
      // Generate embedding
      const output = await this.pipeline(cleanText, { pooling: 'mean', normalize: true });
      
      // Extract embedding array
      const embedding = Array.from(output.data) as number[];
      
      const processingTime = Date.now() - startTime;
      
      return {
        embedding,
        tokens: cleanText.split(' ').length, // Rough token estimate
        processing_time: processingTime
      };
    } catch (error) {
      console.error('❌ Error generating embedding:', error);
      throw new Error(`Failed to generate embedding: ${error}`);
    }
  }

  async generateBatchEmbeddings(texts: string[]): Promise<EmbeddingResult[]> {
    const results: EmbeddingResult[] = [];
    
    console.log(`🔄 Generating embeddings for ${texts.length} texts...`);
    
    for (let i = 0; i < texts.length; i++) {
      try {
        const result = await this.generateEmbedding(texts[i]);
        results.push(result);
        
        // Progress logging
        if ((i + 1) % 10 === 0) {
          console.log(`📊 Processed ${i + 1}/${texts.length} embeddings`);
        }
      } catch (error) {
        console.error(`❌ Failed to generate embedding for text ${i + 1}:`, error);
        // Push a zero vector as fallback
        results.push({
          embedding: new Array(384).fill(0),
          tokens: 0,
          processing_time: 0
        });
      }
    }
    
    console.log('✅ Batch embedding generation completed');
    return results;
  }

  async generateArticleEmbeddings(article: {
    title: string;
    summary: string;
    content?: string;
  }): Promise<{
    title_embedding: number[];
    summary_embedding: number[];
    content_embedding?: number[];
  }> {
    try {
      const embeddings: any = {};
      
      // Generate title embedding
      const titleResult = await this.generateEmbedding(article.title);
      embeddings.title_embedding = titleResult.embedding;
      
      // Generate summary embedding
      const summaryResult = await this.generateEmbedding(article.summary);
      embeddings.summary_embedding = summaryResult.embedding;
      
      // Generate content embedding if available
      if (article.content && article.content.length > 50) {
        const contentResult = await this.generateEmbedding(article.content);
        embeddings.content_embedding = contentResult.embedding;
      }
      
      return embeddings;
    } catch (error) {
      console.error('❌ Error generating article embeddings:', error);
      throw new Error('Failed to generate article embeddings');
    }
  }

  private preprocessText(text: string): string {
    // Clean and normalize text
    let cleaned = text
      .replace(/\s+/g, ' ')           // Normalize whitespace
      .replace(/[^\w\s\-.,!?]/g, '')  // Remove special characters
      .trim();
    
    // Truncate to reasonable length (roughly 512 tokens)
    const maxLength = 2000; // characters
    if (cleaned.length > maxLength) {
      cleaned = cleaned.substring(0, maxLength).trim();
      // Try to end at a word boundary
      const lastSpace = cleaned.lastIndexOf(' ');
      if (lastSpace > maxLength * 0.8) {
        cleaned = cleaned.substring(0, lastSpace);
      }
    }
    
    return cleaned;
  }

  // Compute cosine similarity between two embeddings
  cosineSimilarity(a: number[], b: number[]): number {
    if (a.length !== b.length) {
      throw new Error('Embedding dimensions must match');
    }
    
    let dotProduct = 0;
    let normA = 0;
    let normB = 0;
    
    for (let i = 0; i < a.length; i++) {
      dotProduct += a[i] * b[i];
      normA += a[i] * a[i];
      normB += b[i] * b[i];
    }
    
    normA = Math.sqrt(normA);
    normB = Math.sqrt(normB);
    
    if (normA === 0 || normB === 0) {
      return 0;
    }
    
    return dotProduct / (normA * normB);
  }

  // Find most similar embeddings
  findSimilar(queryEmbedding: number[], candidateEmbeddings: { id: string; embedding: number[] }[], topK: number = 5): { id: string; similarity: number }[] {
    const similarities = candidateEmbeddings.map(candidate => ({
      id: candidate.id,
      similarity: this.cosineSimilarity(queryEmbedding, candidate.embedding)
    }));
    
    return similarities
      .sort((a, b) => b.similarity - a.similarity)
      .slice(0, topK);
  }

  // Get model info
  getModelInfo() {
    return {
      model: this.modelName,
      dimensions: 384,
      status: this.pipeline ? 'loaded' : (this.isLoading ? 'loading' : 'not_loaded'),
      local: true,
      cost: 0
    };
  }
}

// Create singleton instance
export const embeddingsService = new EmbeddingsService();

export default embeddingsService;