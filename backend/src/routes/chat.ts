import express from 'express';
import { db } from '../services/database';
import { embeddingsService } from '../services/embeddings';
import { claudeService } from '../services/claude';
import { openSearchService } from '../services/opensearch';

const router = express.Router();

interface ChatRequest {
  message: string;
}

// POST /api/chat - Send chat message with RAG
router.post('/', async (req, res) => {
  try {
    const { message }: ChatRequest = req.body;

    if (!message || message.trim().length === 0) {
      return res.status(400).json({
        error: 'Message is required',
        message: 'Please provide a valid message'
      });
    }

    console.log(`💬 Processing chat query: "${message}"`);

    // Step 1: Generate embedding for the user query
    let queryEmbedding: number[] = [];
    let relevantArticles: any[] = [];

    try {
      const embeddingResult = await embeddingsService.generateEmbedding(message);
      queryEmbedding = embeddingResult.embedding;
    } catch (error) {
      console.log('⚠️  Embedding generation failed, using text search');
    }

    // Step 2: Search for relevant articles using OpenSearch (with PostgreSQL fallback)
    try {
      // Try OpenSearch first
      relevantArticles = await openSearchService.searchArticles(message, 5);
      
      // Fallback to PostgreSQL if OpenSearch returns no results
      if (relevantArticles.length === 0) {
        console.log('🔄 OpenSearch returned no results, falling back to PostgreSQL');
        relevantArticles = await db.searchArticles(message);
      }
      
      console.log(`📄 Found ${relevantArticles.length} relevant articles`);
    } catch (error) {
      console.error('Search error:', error);
      // Final fallback to PostgreSQL
      try {
        relevantArticles = await db.searchArticles(message);
      } catch (dbError) {
        console.error('PostgreSQL search also failed:', dbError);
        relevantArticles = [];
      }
    }

    // Step 3: Generate response using Claude with context
    const chatResponse = await claudeService.generateChatResponse(message, relevantArticles);

    // Step 4: Return response
    res.json({
      response: chatResponse.response,
      sources: chatResponse.sources,
      metadata: {
        articles_found: relevantArticles.length,
        tokens_used: chatResponse.tokens_used,
        processing_time: chatResponse.processing_time,
        claude_enabled: claudeService.getStatus().enabled
      },
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('❌ Chat processing error:', error);
    res.status(500).json({
      error: 'Chat processing failed',
      message: 'Unable to process your message at this time'
    });
  }
});

// GET /api/chat/status - Chat service status
router.get('/status', (req, res) => {
  const embeddingStatus = embeddingsService.getModelInfo();
  const claudeStatus = claudeService.getStatus();

  res.json({
    status: 'online',
    message: 'Chat service is ready',
    services: {
      embeddings: embeddingStatus,
      claude: claudeStatus,
      database: true // db connection tested on startup
    },
    features: {
      rag_enabled: true,
      vector_search: embeddingStatus.status === 'loaded',
      claude_connected: claudeStatus.enabled
    }
  });
});

export default router;