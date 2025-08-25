// Use require to avoid TypeScript issues with node-imap
const Imap = require('node-imap');
import { simpleParser, ParsedMail } from 'mailparser';
import { db } from './database';
import { embeddingsService } from './embeddings';
import { openSearchService } from './opensearch';

interface NewsletterArticle {
  title: string;
  summary: string;
  url: string;
}

interface ParsedNewsletter {
  source: string;
  articles: NewsletterArticle[];
  date: Date;
}

class EmailProcessor {
  private imapConfig: any;

  constructor() {
    this.imapConfig = {
      user: process.env.EMAIL_USER || '',
      password: process.env.EMAIL_PASS || '',
      host: process.env.EMAIL_HOST || 'imap.gmail.com',
      port: 993,
      tls: true,
      tlsOptions: {
        rejectUnauthorized: false
      }
    };
  }

  async processRecentEmails(): Promise<void> {
    return new Promise((resolve, reject) => {
      if (!this.imapConfig.user || !this.imapConfig.password) {
        console.log('⚠️  Email credentials not configured. Skipping email processing.');
        resolve();
        return;
      }

      console.log('📧 Connecting to email server...');
      const imap = new Imap(this.imapConfig);

      imap.once('ready', () => {
        console.log('✅ Connected to email server');
        
        imap.openBox('INBOX', false, (err: Error | null, box: any) => {
          if (err) {
            reject(err);
            return;
          }

          // Search for emails from the last 24 hours
          const yesterday = new Date();
          yesterday.setDate(yesterday.getDate() - 1);
          
          // Search for TLDR newsletters - simple subject search
          const searchCriteria = [
            ['SINCE', yesterday],
            ['SUBJECT', 'TLDR']
          ];

          imap.search(searchCriteria, (err: Error | null, results: number[]) => {
            if (err) {
              reject(err);
              return;
            }

            if (!results || results.length === 0) {
              console.log('📭 No new newsletter emails found');
              imap.end();
              resolve();
              return;
            }

            console.log(`📬 Found ${results.length} newsletter emails`);
            this.processEmails(imap, results)
              .then(() => {
                imap.end();
                resolve();
              })
              .catch(reject);
          });
        });
      });

      imap.once('error', (err: Error) => {
        console.error('❌ Email connection error:', err);
        reject(err);
      });

      imap.connect();
    });
  }

  private async processEmails(imap: any, emailIds: number[]): Promise<void> {
    return new Promise((resolve, reject) => {
      const fetch = imap.fetch(emailIds, { bodies: '' });
      
      fetch.on('message', (msg: any) => {
        msg.on('body', async (stream: any) => {
          try {
            const parsed: ParsedMail = await simpleParser(stream);
            const newsletter = this.parseNewsletterContent(parsed);
            
            if (newsletter && newsletter.articles.length > 0) {
              await this.saveNewsletterArticles(newsletter);
            }
          } catch (error) {
            console.error('❌ Error processing email:', error);
          }
        });
      });

      fetch.once('error', reject);
      fetch.once('end', resolve);
    });
  }

  private parseNewsletterContent(email: ParsedMail): ParsedNewsletter | null {
    try {
      const subject = email.subject || '';
      const htmlContent = email.html ? email.html.toString() : '';
      const textContent = email.text || '';
      
      console.log('📰 Parsing newsletter:', subject);

      // Determine newsletter source
      let source = 'tldr_base';
      if (subject.toLowerCase().includes('ai')) {
        source = 'tldr_ai';
      } else if (subject.toLowerCase().includes('crypto')) {
        source = 'tldr_crypto';
      } else if (subject.toLowerCase().includes('security')) {
        source = 'tldr_security';
      }

      // Parse HTML content for articles
      const articles = this.extractArticlesFromHtml(htmlContent);
      
      // Fallback to text parsing if HTML parsing fails
      if (articles.length === 0 && textContent) {
        articles.push(...this.extractArticlesFromText(textContent));
      }

      return {
        source,
        articles,
        date: email.date || new Date()
      };
    } catch (error) {
      console.error('❌ Error parsing newsletter content:', error);
      return null;
    }
  }

  private extractArticlesFromHtml(html: string): NewsletterArticle[] {
    const articles: NewsletterArticle[] = [];
    
    if (!html) return articles;

    try {
      // This is a simplified parser - TLDR newsletters have fairly consistent structure
      // Look for patterns like:
      // <a href="url">Title</a>
      // followed by summary text
      
      const linkRegex = /<a[^>]+href=["']([^"']+)["'][^>]*>([^<]+)<\/a>/gi;
      const matches = Array.from(html.matchAll(linkRegex));
      
      for (const match of matches) {
        const url = match[1];
        const title = match[2].trim();
        
        // Skip internal TLDR links and common navigation links
        if (this.isValidArticleUrl(url) && this.isValidArticleTitle(title)) {
          // Try to find summary text after the link
          const summary = this.findSummaryAfterTitle(html, title);
          
          articles.push({
            title: this.cleanTitle(title),
            summary: summary || `Summary from ${title}`,
            url: this.cleanUrl(url)
          });
        }
      }
    } catch (error) {
      console.error('❌ Error parsing HTML:', error);
    }

    return articles;
  }

  private extractArticlesFromText(text: string): NewsletterArticle[] {
    const articles: NewsletterArticle[] = [];
    
    try {
      // Simple text-based parsing for fallback
      const lines = text.split('\n').map(line => line.trim()).filter(line => line.length > 0);
      
      for (let i = 0; i < lines.length - 1; i++) {
        const line = lines[i];
        
        // Look for URLs in the text
        const urlMatch = line.match(/https?:\/\/[^\s]+/);
        if (urlMatch && this.isValidArticleUrl(urlMatch[0])) {
          const url = urlMatch[0];
          
          // Use the line as title (removing the URL)
          const title = line.replace(url, '').trim();
          
          // Next line might be summary
          const summary = lines[i + 1] || `Article from ${title}`;
          
          if (this.isValidArticleTitle(title)) {
            articles.push({
              title: this.cleanTitle(title),
              summary: summary.substring(0, 500), // Limit summary length
              url: this.cleanUrl(url)
            });
          }
        }
      }
    } catch (error) {
      console.error('❌ Error parsing text:', error);
    }

    return articles;
  }

  private isValidArticleUrl(url: string): boolean {
    if (!url || url.length < 10) return false;
    
    // Skip TLDR internal links and common non-article URLs
    const skipPatterns = [
      'tldrnewsletter.com',
      'unsubscribe',
      'manage',
      'preferences',
      'twitter.com',
      'facebook.com',
      'linkedin.com',
      'instagram.com'
    ];
    
    return !skipPatterns.some(pattern => url.toLowerCase().includes(pattern));
  }

  private isValidArticleTitle(title: string): boolean {
    if (!title || title.length < 10 || title.length > 200) return false;
    
    // Skip common navigation text
    const skipPatterns = [
      'unsubscribe',
      'manage preferences',
      'view in browser',
      'forward to a friend',
      'click here'
    ];
    
    return !skipPatterns.some(pattern => title.toLowerCase().includes(pattern));
  }

  private findSummaryAfterTitle(html: string, title: string): string {
    try {
      // Find the position of the title in the HTML
      const titleIndex = html.indexOf(title);
      if (titleIndex === -1) return '';
      
      // Look for text content after the title
      const afterTitle = html.substring(titleIndex + title.length);
      
      // Remove HTML tags and get first paragraph
      const textOnly = afterTitle.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
      
      // Take first sentence or first 200 characters
      const firstSentence = textOnly.split('.')[0];
      return firstSentence.length > 10 && firstSentence.length < 300 
        ? firstSentence + '.' 
        : textOnly.substring(0, 200) + '...';
    } catch (error) {
      return '';
    }
  }

  private cleanTitle(title: string): string {
    return title
      .replace(/^\s*[\-\•\*]\s*/, '') // Remove leading bullets
      .replace(/\s+/g, ' ')
      .trim();
  }

  private cleanUrl(url: string): string {
    // Remove tracking parameters and clean up the URL
    try {
      const urlObj = new URL(url);
      // Remove common tracking parameters
      const trackingParams = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term'];
      trackingParams.forEach(param => urlObj.searchParams.delete(param));
      return urlObj.toString();
    } catch (error) {
      return url;
    }
  }

  private async saveNewsletterArticles(newsletter: ParsedNewsletter): Promise<void> {
    console.log(`💾 Saving ${newsletter.articles.length} articles from ${newsletter.source}`);
    
    for (const article of newsletter.articles) {
      try {
        // Generate embeddings for the article
        console.log(`🔄 Processing: ${article.title.substring(0, 50)}...`);
        
        const embeddings = await embeddingsService.generateArticleEmbeddings({
          title: article.title,
          summary: article.summary
        });

        // Save to PostgreSQL
        const savedArticle = await db.createArticle({
          title: article.title,
          summary: article.summary,
          source_url: article.url,
          newsletter_source: newsletter.source,
          published_date: newsletter.date.toISOString(),
          title_embedding: embeddings.title_embedding,
          summary_embedding: embeddings.summary_embedding
        });

        // Index in OpenSearch
        await openSearchService.indexArticle(savedArticle, embeddings);
        
        console.log(`✅ Saved: ${article.title.substring(0, 50)}...`);
      } catch (error) {
        console.error(`❌ Error saving article "${article.title}":`, error);
      }
    }
  }

  getStatus() {
    return {
      configured: !!(this.imapConfig.user && this.imapConfig.password),
      host: this.imapConfig.host,
      user: this.imapConfig.user ? this.imapConfig.user.replace(/(.{2}).*(@.*)/, '$1***$2') : 'not configured'
    };
  }
}

export const emailProcessor = new EmailProcessor();
export default emailProcessor;