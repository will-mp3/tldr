import React from 'react';
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
  // TODO: Replace with actual API call in Phase 6
  const placeholderArticles: Article[] = [
    {
      id: '1',
      title: 'Sample Tech Article Title',
      summary: 'This is a placeholder summary for a tech article. In the real app, this will be populated from TLDR newsletters.',
      source_url: 'https://example.com',
      newsletter_source: 'tldr_base',
      published_date: new Date().toISOString()
    },
    {
      id: '2',
      title: 'Another AI Development',
      summary: 'Another placeholder summary about AI developments. These will be real articles once we implement the newsletter processing.',
      source_url: 'https://example.com',
      newsletter_source: 'tldr_ai',
      published_date: new Date().toISOString()
    }
  ];

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

  return (
    <div className="article-cards">
      <div className="articles-header">
        <h2>Recent Articles</h2>
        <p>Latest tech news from our news sources</p>
      </div>

      <div className="articles-grid">
        {placeholderArticles.map(article => (
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

      <div className="placeholder-notice">
        <p>Showing placeholder articles. Real articles will appear here once newsletter processing is implemented.</p>
      </div>
    </div>
  );
};

export default ArticleCards;