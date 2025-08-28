import axios from 'axios';
import * as cheerio from 'cheerio';
import { URL } from 'url';

interface ScrapedContent {
  content: string;
  title: string;
  success: boolean;
  url: string;
  wordCount: number;
  scrapingTime: number;
  error?: string;
}

/**
 * ContentScraper Service
 * 
 * Purpose: Scrapes full article content from URLs extracted from TLDR newsletters.
 * This content is used exclusively for generating embeddings to improve RAG responses.
 * The content is NOT displayed in the frontend - only title/summary are shown to users.
 */
class ContentScraperService {
  private readonly USER_AGENT = 'Mozilla/5.0 (compatible; TLDR-Newsletter-Bot/1.0; +https://tldr.tech)';
  private readonly TIMEOUT_MS = 15000; // 15 seconds
  private readonly MAX_CONTENT_LENGTH = 50000; // ~50KB limit for reasonable embedding sizes
  private readonly REQUEST_DELAY_MS = 2000; // 2 second delay between requests to be respectful

  // Domains that frequently block bots or have aggressive paywalls
  private readonly PROBLEMATIC_DOMAINS = [
    'medium.com',
    'substack.com',
    'bloomberg.com', 
    'wsj.com',
    'nytimes.com',
    'ft.com'
  ];

  // Content selectors in order of preference for extracting main article content
  private readonly CONTENT_SELECTORS = [
    'article',                          // Semantic article tag
    '[role="main"] article',           // Main article in main role
    '.article-content',                // Common class name
    '.post-content',                   // Blog post content
    '.entry-content',                  // WordPress default
    '.story-body',                     // News sites
    '.content',                        // Generic content
    'main',                           // Main semantic element
    '#content',                       // Content ID
    '.prose'                          // Prose content (Tailwind/markdown)
  ];

  constructor() {}

  /**
   * Scrapes full article content from a given URL
   * 
   * @param url - The article URL to scrape
   * @param retries - Number of retries on failure (default: 2)
   * @returns ScrapedContent object with extracted content and metadata
   */
  async scrapeArticleContent(url: string, retries: number = 2): Promise<ScrapedContent> {
    const startTime = Date.now();
    
    try {
      // Validate URL format
      if (!this.isValidUrl(url)) {
        return {
          content: '',
          title: '',
          success: false,
          url,
          wordCount: 0,
          scrapingTime: Date.now() - startTime,
          error: 'Invalid URL format'
        };
      }

      // Check if domain is known to be problematic
      if (this.isProblematicDomain(url)) {
        console.warn(`⚠️  Skipping potentially problematic domain: ${new URL(url).hostname}`);
        return {
          content: '',
          title: '',
          success: false,
          url,
          wordCount: 0,
          scrapingTime: Date.now() - startTime,
          error: 'Domain known to be problematic for scraping'
        };
      }

      console.log(`🔄 Scraping content from: ${url}`);

      // Add delay to be respectful to target servers
      await this.delay(this.REQUEST_DELAY_MS);

      // Fetch the HTML content
      const response = await axios.get(url, {
        timeout: this.TIMEOUT_MS,
        headers: {
          'User-Agent': this.USER_AGENT,
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.5',
          'Accept-Encoding': 'gzip, deflate',
          'Connection': 'keep-alive',
        },
        maxRedirects: 5,
        validateStatus: (status) => status < 400, // Accept 2xx and 3xx status codes
      });

      if (!response.data || typeof response.data !== 'string') {
        throw new Error('Invalid response data');
      }

      // Parse HTML and extract content
      const $ = cheerio.load(response.data);
      
      // Extract the main article content
      // @ts-ignore
      const extractedContent = this.extractMainContent($);
      
      // Extract title if available
      // @ts-ignore
      const extractedTitle = this.extractTitle($);
      
      if (!extractedContent || extractedContent.length < 100) {
        throw new Error('Insufficient content extracted');
      }

      const wordCount = extractedContent.split(/\s+/).length;
      
      console.log(`✅ Successfully scraped ${wordCount} words from ${new URL(url).hostname}`);

      return {
        content: extractedContent,
        title: extractedTitle,
        success: true,
        url,
        wordCount,
        scrapingTime: Date.now() - startTime
      };

    } catch (error) {
      console.error(`❌ Failed to scrape ${url}:`, error instanceof Error ? error.message : 'Unknown error');
      
      // Retry logic
      if (retries > 0) {
        console.log(`🔄 Retrying... (${retries} attempts remaining)`);
        await this.delay(3000); // Wait 3 seconds before retry
        return this.scrapeArticleContent(url, retries - 1);
      }

      return {
        content: '',
        title: '',
        success: false,
        url,
        wordCount: 0,
        scrapingTime: Date.now() - startTime,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  /**
   * Extracts the main article content using various content selectors
   * Prioritizes semantic HTML elements and common content class names
   */
  private extractMainContent($: cheerio.CheerioAPI): string {
    // Remove unwanted elements that add noise
    this.removeUnwantedElements($);

    // Try each content selector in order of preference
    for (const selector of this.CONTENT_SELECTORS) {
      const element = $(selector).first();
      if (element.length > 0) {
        const content = element.text().trim();
        if (content.length > 200) { // Minimum content length threshold
          console.log(`📄 Content extracted using selector: ${selector}`);
          return this.cleanContent(content);
        }
      }
    }

    // Fallback: extract all paragraph content
    const paragraphs = $('p').map((_, el) => $(el).text().trim()).get();
    const fallbackContent = paragraphs.join('\n\n').trim();
    
    if (fallbackContent.length > 200) {
      console.log(`📄 Content extracted using fallback paragraph method`);
      return this.cleanContent(fallbackContent);
    }

    // Last resort: get all text content from body
    const bodyContent = $('body').text().trim();
    console.log(`📄 Content extracted using body text fallback`);
    return this.cleanContent(bodyContent);
  }

  /**
   * Extracts the article title from various possible locations
   */
  private extractTitle($: cheerio.CheerioAPI): string {
    // Try different title selectors in order of preference
    const titleSelectors = [
      'h1',                           // Main heading
      'article h1',                   // Article heading
      '.article-title',              // Common class
      '.post-title',                 // Blog post title
      '.entry-title',                // WordPress default
      'title',                       // Page title as fallback
      '[property="og:title"]'        // Open Graph title
    ];

    for (const selector of titleSelectors) {
      const element = $(selector).first();
      if (element.length > 0) {
        const title = selector === 'title' || selector.includes('og:title') 
          ? element.attr('content') || element.text()
          : element.text();
        
        if (title && title.trim().length > 0) {
          return title.trim();
        }
      }
    }

    return '';
  }

  /**
   * Removes elements that typically don't contain article content
   * This helps focus on the main content and reduces noise in embeddings
   */
  private removeUnwantedElements($: cheerio.CheerioAPI): void {
    const unwantedSelectors = [
      'nav', 'header', 'footer',      // Navigation and layout
      '.nav', '.navigation',          // Navigation classes  
      '.sidebar', '.widget',          // Sidebar content
      '.advertisement', '.ads',       // Advertisement content
      '.social', '.share',            // Social sharing buttons
      '.comments', '.comment',        // Comment sections
      'script', 'style', 'noscript', // Script and style tags
      '.cookie-notice',               // Cookie notices
      '.newsletter-signup',           // Newsletter signups
      '.related-posts',               // Related content
      '.author-bio',                  // Author information
      '.tags', '.categories',         // Taxonomy
      '[class*="ad-"]',              // Ad-related classes
      '[id*="ad-"]'                  // Ad-related IDs
    ];

    unwantedSelectors.forEach(selector => {
      $(selector).remove();
    });
  }

  /**
   * Cleans and normalizes extracted content
   * Removes excessive whitespace and limits content length for embedding efficiency
   */
  private cleanContent(content: string): string {
    let cleaned = content
      .replace(/\s+/g, ' ')                    // Normalize whitespace
      .replace(/\n\s*\n/g, '\n\n')            // Clean up line breaks
      .replace(/[^\w\s\-.,!?;:()\[\]"']/g, '') // Remove special characters except punctuation
      .trim();

    // Truncate if too long (for embedding efficiency)
    if (cleaned.length > this.MAX_CONTENT_LENGTH) {
      cleaned = cleaned.substring(0, this.MAX_CONTENT_LENGTH);
      // Try to end at a sentence boundary
      const lastSentence = cleaned.lastIndexOf('.');
      if (lastSentence > this.MAX_CONTENT_LENGTH * 0.8) {
        cleaned = cleaned.substring(0, lastSentence + 1);
      }
      console.log(`📏 Content truncated to ${cleaned.length} characters`);
    }

    return cleaned;
  }

  /**
   * Validates if a URL is properly formatted and accessible
   */
  private isValidUrl(url: string): boolean {
    try {
      const parsedUrl = new URL(url);
      return parsedUrl.protocol === 'http:' || parsedUrl.protocol === 'https:';
    } catch {
      return false;
    }
  }

  /**
   * Checks if a domain is known to be problematic for scraping
   * (paywall sites, aggressive bot detection, etc.)
   */
  private isProblematicDomain(url: string): boolean {
    try {
      const hostname = new URL(url).hostname.toLowerCase();
      return this.PROBLEMATIC_DOMAINS.some(domain => 
        hostname.includes(domain.toLowerCase())
      );
    } catch {
      return false;
    }
  }

  /**
   * Utility function to add delays between requests
   */
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Get service status and configuration
   */
  getStatus() {
    return {
      service: 'ContentScraperService',
      timeout: this.TIMEOUT_MS,
      maxContentLength: this.MAX_CONTENT_LENGTH,
      requestDelay: this.REQUEST_DELAY_MS,
      userAgent: this.USER_AGENT,
      contentSelectors: this.CONTENT_SELECTORS.length,
      problematicDomains: this.PROBLEMATIC_DOMAINS.length
    };
  }
}

// Create singleton instance
export const contentScraperService = new ContentScraperService();
export { ScrapedContent };
export default contentScraperService;