import express from 'express';
import { db, Article } from '../services/database';
import { openSearchService } from '../services/opensearch';

const router = express.Router();

// GET /api/articles - Get all articles
router.get('/', async (req, res) => {
  try {
    const { limit = 10, offset = 0 } = req.query;
    
    const limitNum = parseInt(limit as string);
    const offsetNum = parseInt(offset as string);
    
    const result = await db.getArticles(limitNum, offsetNum);
    
    res.json({
      articles: result.articles,
      total: result.total,
      limit: limitNum,
      offset: offsetNum,
      message: result.articles.length > 0 ? 'Articles loaded from database' : 'No articles found'
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
    
    const searchResults = await db.searchArticles(query);
    
    res.json({
      articles: searchResults,
      query,
      total: searchResults.length,
      message: `Found ${searchResults.length} articles matching "${query}"`
    });
  } catch (error) {
    console.error('Article search error:', error);
    res.status(500).json({
      error: 'Search failed',
      message: 'Unable to search articles in database'
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
    const { limit = 10 } = req.query;
    
    const articles = await db.getArticlesBySource(source, parseInt(limit as string));
    
    res.json({
      articles,
      source,
      total: articles.length,
      message: `Articles from ${source}`
    });
  } catch (error) {
    console.error('Articles by source error:', error);
    res.status(500).json({
      error: 'Failed to fetch articles by source',
      message: 'Unable to retrieve articles from specified source'
    });
  }
});

// POST /api/articles/sync - Sync articles to OpenSearch
router.post('/sync', async (req, res) => {
  try {
    await openSearchService.syncFromDatabase();
    res.json({
      message: 'Articles synced to OpenSearch successfully',
      status: openSearchService.getStatus()
    });
  } catch (error) {
    console.error('Sync error:', error);
    res.status(500).json({
      error: 'Failed to sync articles',
      message: error.message
    });
  }
});

export default router;