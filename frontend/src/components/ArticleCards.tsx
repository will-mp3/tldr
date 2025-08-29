import React, { useState, useEffect } from 'react';
import { apiClient } from '../services/api';
import './ArticleCards.css';

interface Article {
  id: string;
  title: string;
  summary: string;
  source_url: string;
  newsletter_source: string;
  published_date: string;
}

const ArticleCards: React.FC = () => {
  const [articles, setArticles] = useState<Article[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchArticles();
  }, []);

  const fetchArticles = async () => {
    try {
      setLoading(true);
      const response = await apiClient.getArticles(30, 0); // Increased to 30 to ensure we get all today's articles
      // @ts-ignore
      setArticles(response.data.articles);
    } catch (err) {
      console.error('Error fetching articles:', err);
      setError('Failed to load articles');
    } finally {
      setLoading(false);
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const getSourceBadgeColor = (source: string) => {
    switch (source) {
      case 'tldr_ai': return 'ai';
      case 'tldr_crypto': return 'crypto';
      case 'tldr_security': return 'security';
      default: return 'base';
    }
  };

  if (loading) {
    return (
      <div className="article-cards">
        <div className="articles-header">
          <h2>Recent Articles</h2>
          <p>Loading latest tech news...</p>
        </div>
        <div className="loading-spinner">Loading...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="article-cards">
        <div className="articles-header">
          <h2>Recent Articles</h2>
          <p style={{ color: '#ff6b6b' }}>{error}</p>
        </div>
        <button onClick={fetchArticles} className="retry-button">
          Retry
        </button>
      </div>
    );
  }

  return (
    <div className="article-cards">
      <div className="articles-header">
        <h2>Today's Tech & AI News</h2>
        <p>The latest tech news all in one place.</p>
      </div>

      <div className="articles-grid">
        {articles.map(article => (
          <article key={article.id} className="article-card">
            <div className="article-header">
              <span className={`source-badge ${getSourceBadgeColor(article.newsletter_source)}`}>
                {article.newsletter_source.replace('tldr_', '').toUpperCase()}
              </span>
              <time className="article-date">
                {formatDate(article.published_date)}
              </time>
            </div>
            
            <h3 className="article-title">
              <a 
                href={article.source_url} 
                target="_blank" 
                rel="noopener noreferrer"
                className="article-link"
              >
                {article.title}
              </a>
            </h3>
            
            <p className="article-summary">
              {article.summary}
            </p>
          </article>
        ))}
      </div>

      {articles.length === 0 && (
        <div className="placeholder-notice">
          <p>📝 No articles found.</p>
        </div>
      )}
    </div>
  );
};

export default ArticleCards;