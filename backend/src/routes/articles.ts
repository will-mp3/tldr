import express from 'express';
import { db } from '../services/database';
import { openSearchService } from '../services/opensearch';
import { emailProcessor } from '../services/emailProcessor';
import { schedulerService } from '../services/scheduler';

const router = express.Router();

// GET /api/articles - Get all articles with pagination
router.get('/', async (req, res) => {
  try {
    const { limit = 20, offset = 0 } = req.query;
    
    const limitNum = parseInt(limit as string);
    const offsetNum = parseInt(offset as string);
    
    const result = await db.getArticles(limitNum, offsetNum);
    
    res.json({
      articles: result.articles,
      total: result.total,
      limit: limitNum,
      offset: offsetNum
    });
  } catch (error) {
    console.error('Articles fetch error:', error);
    res.status(500).json({
      error: 'Failed to fetch articles',
      message: 'Unable to retrieve articles from database'
    });
  }
});

// GET /api/articles/search - Search articles
router.get('/search', async (req, res) => {
  try {
    const { q: query } = req.query;
    
    if (!query || typeof query !== 'string') {
      return res.status(400).json({
        error: 'Query parameter is required',
        message: 'Please provide a search query'
      });
    }
    
    // Try OpenSearch first, fallback to database search
    let searchResults: any[] = [];
    
    try {
      searchResults = await openSearchService.searchArticles(query, 10);
      if (searchResults.length === 0) {
        searchResults = await db.searchArticles(query);
      }
    } catch (error) {
      console.error('Search error:', error);
      searchResults = await db.searchArticles(query);
    }
    
    res.json({
      articles: searchResults,
      query,
      total: searchResults.length,
      source: searchResults.length > 0 ? 'search' : 'none'
    });
  } catch (error) {
    console.error('Article search error:', error);
    res.status(500).json({
      error: 'Search failed',
      message: 'Unable to search articles'
    });
  }
});

// GET /api/articles/:id - Get specific article
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const article = await db.getArticleById(id);
    
    if (!article) {
      return res.status(404).json({
        error: 'Article not found',
        message: 'The requested article does not exist'
      });
    }
    
    res.json(article);
  } catch (error) {
    console.error('Article fetch error:', error);
    res.status(500).json({
      error: 'Failed to fetch article',
      message: 'Unable to retrieve the requested article'
    });
  }
});

// GET /api/articles/source/:source - Get articles by newsletter source
router.get('/source/:source', async (req, res) => {
  try {
    const { source } = req.params;
    const { limit = 20 } = req.query;
    
    const articles = await db.getArticlesBySource(source, parseInt(limit as string));
    
    res.json({
      articles,
      source,
      total: articles.length
    });
  } catch (error) {
    console.error('Articles by source error:', error);
    res.status(500).json({
      error: 'Failed to fetch articles by source',
      message: 'Unable to retrieve articles from specified source'
    });
  }
});

// POST /api/articles/process-emails - Process recent newsletter emails
router.post('/process-emails', async (req, res) => {
  try {
    console.log('🔄 Starting email processing...');
    await emailProcessor.processRecentEmails();
    
    res.json({
      message: 'Email processing completed',
      status: emailProcessor.getStatus(),
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Email processing error:', error);
    res.status(500).json({
      error: 'Failed to process emails',
      message: error.message || 'Email processing failed'
    });
  }
});

// POST /api/articles/sync-opensearch - Sync existing articles to OpenSearch
router.post('/sync-opensearch', async (req, res) => {
  try {
    console.log('🔄 Syncing articles to OpenSearch...');
    await openSearchService.syncFromDatabase();
    
    res.json({
      message: 'Articles synced to OpenSearch successfully',
      status: openSearchService.getStatus(),
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('OpenSearch sync error:', error);
    res.status(500).json({
      error: 'Failed to sync to OpenSearch',
      message: error.message || 'Sync failed'
    });
  }
});

// POST /api/articles/cleanup - Clean up expired articles
router.post('/cleanup', async (req, res) => {
  try {
    console.log('🗑️ Starting manual cleanup...');
    const deletedCount = await schedulerService.runCleanup();
    
    res.json({
      message: 'Cleanup completed successfully',
      deleted_articles: deletedCount,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Cleanup error:', error);
    res.status(500).json({
      error: 'Failed to cleanup articles',
      message: error.message || 'Cleanup failed'
    });
  }
});

// GET /api/articles/status - Get system status
router.get('/status/system', async (req, res) => {
  try {
    const dbResult = await db.getArticles(1, 0);
    
    res.json({
      database: {
        connected: true,
        total_articles: dbResult.total
      },
      opensearch: openSearchService.getStatus(),
      email_processor: emailProcessor.getStatus(),
      scheduler: schedulerService.getStatus(),
      last_check: new Date().toISOString()
    });
  } catch (error) {
    console.error('Status check error:', error);
    res.status(500).json({
      error: 'Failed to get system status',
      message: error.message || 'Status check failed'
    });
  }
});

export default router;