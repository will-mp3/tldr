import express from 'express';

const router = express.Router();

interface Article {
  id: string;
  title: string;
  summary: string;
  content?: string;
  source_url: string;
  newsletter_source: string;
  published_date: string;
  created_at: string;
}

// Placeholder articles for development
const placeholderArticles: Article[] = [
  {
    id: '1',
    title: 'OpenAI Releases GPT-4 Turbo with Improved Performance',
    summary: 'OpenAI has announced GPT-4 Turbo, featuring enhanced performance and lower costs for developers building AI applications.',
    source_url: 'https://openai.com/blog/gpt-4-turbo',
    newsletter_source: 'tldr_ai',
    published_date: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(), // 2 hours ago
    created_at: new Date().toISOString()
  },
  {
    id: '2',
    title: 'Meta Introduces Code Llama 70B for Advanced Programming Tasks',
    summary: 'Meta has released Code Llama 70B, a large language model specifically designed for code generation and programming assistance.',
    source_url: 'https://ai.meta.com/blog/code-llama-70b',
    newsletter_source: 'tldr_ai',
    published_date: new Date(Date.now() - 4 * 60 * 60 * 1000).toISOString(), // 4 hours ago
    created_at: new Date().toISOString()
  },
  {
    id: '3',
    title: 'Google Announces Gemini Pro with Multimodal Capabilities',
    summary: 'Google has unveiled Gemini Pro, featuring advanced multimodal AI capabilities that can process text, images, and audio simultaneously.',
    source_url: 'https://blog.google/technology/ai/google-gemini-ai',
    newsletter_source: 'tldr_base',
    published_date: new Date(Date.now() - 6 * 60 * 60 * 1000).toISOString(), // 6 hours ago
    created_at: new Date().toISOString()
  }
];

// GET /api/articles - Get all articles
router.get('/', (req, res) => {
  try {
    const { limit = 10, offset = 0 } = req.query;
    
    const limitNum = parseInt(limit as string);
    const offsetNum = parseInt(offset as string);
    
    const paginatedArticles = placeholderArticles.slice(offsetNum, offsetNum + limitNum);
    
    res.json({
      articles: paginatedArticles,
      total: placeholderArticles.length,
      limit: limitNum,
      offset: offsetNum,
      message: 'Showing placeholder articles. Real articles will be available after newsletter processing is implemented.'
    });
  } catch (error) {
    console.error('Articles fetch error:', error);
    res.status(500).json({
      error: 'Failed to fetch articles',
      message: 'Unable to retrieve articles at this time'
    });
  }
});

// GET /api/articles/search - Search articles
router.get('/search', (req, res) => {
  try {
    const { q: query } = req.query;
    
    if (!query || typeof query !== 'string') {
      return res.status(400).json({
        error: 'Query parameter is required',
        message: 'Please provide a search query'
      });
    }
    
    // Simple text search for development
    const searchResults = placeholderArticles.filter(article => 
      article.title.toLowerCase().includes(query.toLowerCase()) ||
      article.summary.toLowerCase().includes(query.toLowerCase())
    );
    
    res.json({
      articles: searchResults,
      query,
      total: searchResults.length,
      message: 'Basic text search. Vector search will be available in Phase 3.'
    });
  } catch (error) {
    console.error('Article search error:', error);
    res.status(500).json({
      error: 'Search failed',
      message: 'Unable to search articles at this time'
    });
  }
});

// GET /api/articles/:id - Get specific article
router.get('/:id', (req, res) => {
  try {
    const { id } = req.params;
    const article = placeholderArticles.find(a => a.id === id);
    
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

export default router;