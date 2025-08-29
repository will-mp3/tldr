const Imap = require('node-imap');
import { simpleParser, ParsedMail } from 'mailparser';
import { db } from './database';
import { embeddingsService } from './embeddings';
import { openSearchService } from './opensearch';
import { contentScraperService } from './contentScraper';
import * as cheerio from 'cheerio';

interface Article {
  title: string;
  summary: string;
  url: string;
  content?: string;
  category?: string;
  readTime?: string;
}

class EmailProcessor {
  private imapConfig: any;
  private readonly TRACKING_URL_PREFIX = 'https://tracking.tldrnewsletter.com';
  private readonly SKIP_DOMAINS = [
    'tldrnewsletter.com',
    'tldr.tech',
    'advertise.tldr.tech',
    'unsubscribe',
    'manage',
    'tracking.tldrnewsletter.com',
    'linkedin.com'           // Filter LinkedIn profile URLs
  ];

  constructor() {
    this.imapConfig = {
      user: process.env.EMAIL_USER || '',
      password: process.env.EMAIL_PASS || '',
      host: process.env.EMAIL_HOST || 'imap.gmail.com',
      port: 993,
      tls: true,
      tlsOptions: { rejectUnauthorized: false }
    };
  }

  async processEmails(): Promise<void> {
    if (!this.imapConfig.user || !this.imapConfig.password) {
      console.log('Email credentials not configured');
      return;
    }

    const imap = new Imap(this.imapConfig);

    return new Promise((resolve, reject) => {
      imap.once('ready', () => {
        console.log('Connected to email');
        
        imap.openBox('INBOX', false, (err: any, box: any) => {
          if (err) throw err;

          imap.search([['FROM', 'dan@tldrnewsletter.com']], (err: any, results: number[]) => {
            if (err) throw err;

            if (!results || results.length === 0) {
              console.log('No emails found');
              imap.end();
              resolve();
              return;
            }

            console.log(`Found ${results.length} emails`);

            const fetch = imap.fetch(results.slice(-10), { bodies: '' });
            
            fetch.on('message', (msg: any) => {
              msg.on('body', async (stream: any) => {
                try {
                  const parsed = await simpleParser(stream);
                  await this.processEmail(parsed);
                } catch (error) {
                  console.error('Error processing email:', error);
                }
              });
            });

            fetch.once('error', reject);
            fetch.once('end', () => {
              console.log('Processing complete');
              imap.end();
              resolve();
            });
          });
        });
      });

      imap.once('error', reject);
      imap.connect();
    });
  }

  private async processEmail(email: ParsedMail): Promise<void> {
    const subject = email.subject || '';
    const fromText = email.from?.text || '';
    const html = email.html ? email.html.toString() : '';
    const text = email.text || '';
    const emailDate = email.date || new Date();

    console.log(`\n=== Processing Email ===`);
    console.log(`Subject: ${subject}`);
    console.log(`From: ${fromText}`);
    console.log(`Date: ${emailDate.toISOString()}`);
    console.log(`HTML length: ${html.length}`);
    console.log(`Text length: ${text.length}`);

    // Check if email is within 24 hours
    const oneDayAgo = new Date();
    oneDayAgo.setDate(oneDayAgo.getDate() - 1);
    
    if (emailDate < oneDayAgo) {
      console.log('Skipping email older than 24 hours');
      return;
    }

    // Skip non-newsletter emails
    if (this.shouldSkipEmail(subject, text)) {
      console.log('Skipping non-newsletter email (confirmation/welcome)');
      return;
    }

    // Determine newsletter type
    const source = this.detectNewsletterSource(fromText, subject);
    console.log(`Newsletter source: ${source}`);

    // Extract articles with debugging
    const articles = await this.extractArticlesEnhanced(html, text);
    
    console.log(`\n=== Extraction Results ===`);
    console.log(`Found ${articles.length} articles total`);
    
    if (articles.length === 0) {
      console.log('\n!!! No articles found - debugging info:');
      
      // Debug: Check for links in HTML
      const linkMatches = html.match(/<a[^>]+href=["'][^"']+["'][^>]*>/gi);
      console.log(`Total links in HTML: ${linkMatches ? linkMatches.length : 0}`);
      
      if (linkMatches && linkMatches.length > 0) {
        console.log('Sample links found:');
        linkMatches.slice(0, 5).forEach(link => {
          console.log(`  - ${link.substring(0, 100)}...`);
        });
      }
      
      // Debug: Check text structure
      const hasReadTime = text.includes('minute read');
      console.log(`Has "minute read" patterns: ${hasReadTime}`);
      
      if (hasReadTime) {
        const readTimeMatches = text.match(/\(\d+\s*minute\s*read\)/gi);
        console.log(`Read time patterns found: ${readTimeMatches ? readTimeMatches.length : 0}`);
      }
    }

    // Calculate TTL (7 days from now)
    const ttl = new Date();
    ttl.setDate(ttl.getDate() + 7);

    // Save articles with content scraping
    let savedCount = 0;
    let scrapedCount = 0;
    
    console.log(`\n=== Processing ${articles.length} articles ===`);
    
    for (const article of articles) {
      try {
        console.log(`\n📰 Processing article: "${article.title.substring(0, 50)}..."`);
        console.log(`  📍 URL: ${article.url}`);
        console.log(`  📝 Summary length: ${article.summary.length}`);
        
        // Step 1: Scrape full article content
        let articleContent = '';
        console.log(`  🔄 Attempting to scrape full content...`);
        
        try {
          const scrapedResult = await contentScraperService.scrapeArticleContent(article.url);
          
          if (scrapedResult.success && scrapedResult.content.length > 100) {
            articleContent = scrapedResult.content;
            scrapedCount++;
            console.log(`  ✅ Content scraped successfully: ${scrapedResult.wordCount} words (${scrapedResult.scrapingTime}ms)`);
          } else {
            console.log(`  ⚠️  Content scraping failed or insufficient: ${scrapedResult.error || 'Content too short'}`);
          }
        } catch (scrapingError) {
          console.log(`  ⚠️  Content scraping error:`, scrapingError instanceof Error ? scrapingError.message : 'Unknown error');
        }

        // Step 2: Generate embeddings (including content if available)
        console.log(`  🔢 Generating embeddings...`);
        const embeddings = await embeddingsService.generateArticleEmbeddings({
          title: article.title,
          summary: article.summary,
          content: articleContent || undefined
        });

        // Step 3: Save to database
        console.log(`  💾 Saving to database...`);
        const savedArticle = await db.createArticle({
          title: article.title,
          summary: article.summary,
          content: articleContent || undefined, // Only save if content was successfully scraped
          source_url: article.url,
          newsletter_source: source,
          published_date: emailDate.toISOString(),
          title_embedding: embeddings.title_embedding,
          summary_embedding: embeddings.summary_embedding,
          content_embedding: embeddings.content_embedding
        });

        // Step 4: Index in OpenSearch
        console.log(`  🔍 Indexing in OpenSearch...`);
        await openSearchService.indexArticle(savedArticle, embeddings);
        
        savedCount++;
        console.log(`  ✅ Article processed successfully`);
        console.log(`     - Content: ${articleContent ? `${articleContent.length} chars` : 'Not available'}`);
        console.log(`     - Embeddings: Title(${embeddings.title_embedding.length}), Summary(${embeddings.summary_embedding.length}), Content(${embeddings.content_embedding ? embeddings.content_embedding.length : 'None'})`);
        
      } catch (error) {
        console.error(`  ❌ Error processing article:`, error instanceof Error ? error.message : 'Unknown error');
        console.error(`     Article: ${article.title.substring(0, 50)}...`);
        console.error(`     URL: ${article.url}`);
      }
    }
    
    console.log(`\n=== Processing Summary ===`);
    console.log(`📊 Articles processed: ${savedCount}/${articles.length}`);
    console.log(`🔄 Content scraped: ${scrapedCount}/${articles.length} (${Math.round(scrapedCount/articles.length*100)}%)`);
    console.log(`💾 Successfully saved to database: ${savedCount}`);
    
    if (scrapedCount < articles.length) {
      console.log(`⚠️  ${articles.length - scrapedCount} articles saved without full content (will use title/summary for embeddings)`);
    }
  }

  private shouldSkipEmail(subject: string, text: string): boolean {
    const skipKeywords = ['confirm', 'welcome', 'verify', 'subscription', 'thank you'];
    const lowerSubject = subject.toLowerCase();
    
    return skipKeywords.some(keyword => lowerSubject.includes(keyword)) ||
           text.length < 500;
  }

  private detectNewsletterSource(fromText: string, subject: string): string {
    const combined = `${fromText} ${subject}`.toLowerCase();
    
    if (combined.includes('ai')) return 'tldr_ai';
    if (combined.includes('crypto')) return 'tldr_crypto';
    if (combined.includes('web dev') || combined.includes('webdev')) return 'tldr_webdev';
    if (combined.includes('founders')) return 'tldr_founders';
    if (combined.includes('marketing')) return 'tldr_marketing';
    if (combined.includes('design')) return 'tldr_design';
    if (combined.includes('devops')) return 'tldr_devops';
    if (combined.includes('infosec')) return 'tldr_infosec';
    
    return 'tldr_tech';
  }

  private async extractArticlesEnhanced(html: string, text: string): Promise<Article[]> {
    const articles: Article[] = [];
    
    console.log('\n--- Starting article extraction ---');
    
    // Try HTML parsing with cheerio
    if (html) {
      console.log('Attempting HTML parsing...');
      const htmlArticles = this.parseHtmlArticles(html);
      console.log(`HTML parsing found ${htmlArticles.length} articles`);
      articles.push(...htmlArticles);
    }
    
    // Always try text parsing as well
    if (text) {
      console.log('Attempting text parsing...');
      const textArticles = this.parseTextArticles(text);
      console.log(`Text parsing found ${textArticles.length} articles`);
      
      for (const textArticle of textArticles) {
        const isDuplicate = articles.some(a => 
          this.similarity(a.title, textArticle.title) > 0.8
        );
        if (!isDuplicate) {
          console.log(`Adding unique text article: ${textArticle.title.substring(0, 50)}...`);
          articles.push(textArticle);
        }
      }
    }
    
    const deduplicated = this.deduplicateArticles(articles);
    console.log(`After deduplication: ${deduplicated.length} articles`);
    
    return deduplicated;
  }

  private parseHtmlArticles(html: string): Article[] {
    const articles: Article[] = [];
    const $ = cheerio.load(html);
    
    console.log('🔍 HTML parsing - analyzing structure...');
    
    // Debug: Count all links
    const allLinks = $('a');
    console.log(`📊 Total <a> tags found: ${allLinks.length}`);
    
    // Debug: Sample a few links with their text content
    let sampleCount = 0;
    allLinks.each((_: number, element: cheerio.Element) => {
      if (sampleCount < 5) {
        const $link = $(element);
        const href = $link.attr('href') || '';
        const title = $link.text().trim();
        console.log(`🔗 Sample link ${sampleCount + 1}: "${title}" -> ${href.substring(0, 80)}...`);
        this.isArticleLink(href, title, true); // Debug version
        sampleCount++;
      }
    });
    
    // TLDR-specific parsing: Look for tracking URLs and extract titles from surrounding context
    console.log('🎯 TLDR-specific parsing...');
    
    // Find all tracking URLs (these are the article links)
    $('a').each((_: number, linkElement: cheerio.Element) => {
      const $link = $(linkElement);
      const href = $link.attr('href') || '';
      
      // Only process TLDR tracking URLs that aren't navigation/admin links
      if (href.includes(this.TRACKING_URL_PREFIX) && !this.isAdminLink(href)) {
        console.log(`📍 Found tracking URL: ${href.substring(0, 80)}...`);
        
        // Extract the real URL to understand the target
        const realUrl = this.extractRealUrl(href);
        if (realUrl && !this.SKIP_DOMAINS.some(domain => realUrl.toLowerCase().includes(domain.toLowerCase()))) {
          
          // Find the title - it might be in the link text, or in surrounding elements
          let title = $link.text().trim();
          
          // If link text is empty or short, look in parent elements for the title
          if (!title || title.length < 5) {
            const $parent = $link.closest('td, p, div');
            const parentText = $parent.text().trim();
            
            // Extract potential title from parent text (first meaningful line)
            const lines = parentText.split('\n').map(l => l.trim()).filter(l => l.length > 10);
            for (const line of lines) {
              // Skip common non-title patterns
              if (!line.toLowerCase().includes('sponsor') && 
                  !line.toLowerCase().includes('advertise') &&
                  !line.toLowerCase().includes('unsubscribe') &&
                  line.length > 15 && line.length < 200) {
                title = line;
                break;
              }
            }
          }
          
          if (title && title.length > 10) {
            console.log(`✅ Found article: "${title}" -> ${realUrl}`);
            
            // Try to extract summary from surrounding content
            const $parent = $link.closest('td');
            const parentText = $parent.text().trim();
            
            // Check if this is sponsored content before processing further
            if (this.isSponsoredContent(parentText)) {
              console.log(`⚠️  Skipping sponsored content: "${title.substring(0, 50)}..."`);
            } else {
              let summary = '';
              const titleIndex = parentText.indexOf(title);
              if (titleIndex !== -1) {
                const afterTitle = parentText.substring(titleIndex + title.length).trim();
                summary = this.extractSummaryFromText(afterTitle);
              }
              
              articles.push({
                title: this.cleanTitle(title),
                summary: summary || `Article about ${title}`,
                url: realUrl
              });
            }
          } else {
            console.log(`⚠️  Skipping - no valid title found for URL: ${realUrl}`);
          }
        } else {
          console.log(`⚠️  Skipping - blacklisted or invalid URL: ${realUrl}`);
        }
      }
    });
    
    // Original fallback logic for table cells
    $('table td').each((_: number, element: cheerio.Element) => {
      const $cell = $(element);
      const $links = $cell.find('a');
      
      $links.each((_: number, linkElement: cheerio.Element) => {
        const $link = $(linkElement);
        const href = $link.attr('href') || '';
        const title = $link.text().trim();
        
        if (this.isArticleLink(href, title)) {
          const $parent = $link.parent();
          const parentText = $parent.text().trim();
          
          // Check if this is sponsored content before processing further
          if (this.isSponsoredContent(parentText)) {
            console.log(`⚠️  Skipping sponsored content: "${title.substring(0, 50)}..."`);
            return; // Skip this article
          }
          
          let summary = '';
          const titleIndex = parentText.indexOf(title);
          
          if (titleIndex !== -1) {
            const afterTitle = parentText.substring(titleIndex + title.length).trim();
            summary = this.extractSummaryFromText(afterTitle);
          }
          
          if (!summary) {
            const $nextElements = $parent.nextAll();
            // @ts-ignore
            $nextElements.each((i: number, el: cheerio.Element) => {
              if (i > 2) return false;
              const text = $(el).text().trim();
              if (text && text.length > 30 && !this.looksLikeTitle(text)) {
                summary = this.extractSummaryFromText(text);
                return false;
              }
            });
          }
          
          const readTime = this.extractReadTime($cell.text());
          const category = this.detectCategory($cell);
          const cleanUrl = this.extractRealUrl(href);
          
          if (cleanUrl) {
            console.log(`Extracted URL: ${cleanUrl} from ${href.substring(0, 50)}...`);
            articles.push({
              title: this.cleanTitle(title),
              summary: summary || `Article about ${title}`,
              url: cleanUrl,
              category,
              readTime
            });
          }
        }
      });
    });
    
    // Look for strong tags followed by text
    $('strong').each((_: number, element: cheerio.Element) => {
      const $strong = $(element);
      const $link = $strong.find('a').first();
      
      if ($link.length) {
        const href = $link.attr('href') || '';
        const title = $link.text().trim();
        
        if (this.isArticleLink(href, title)) {
          const $container = $strong.closest('td, div, p');
          const containerText = $container.text().trim();
          
          // Check if this is sponsored content before processing further
          if (this.isSponsoredContent(containerText)) {
            console.log(`⚠️  Skipping sponsored content: "${title.substring(0, 50)}..."`);
            return; // Skip this article
          }
          
          const summary = this.extractSummaryFromText(
            containerText.substring(containerText.indexOf(title) + title.length)
          );
          
          const cleanUrl = this.extractRealUrl(href);
          if (cleanUrl) {
            articles.push({
              title: this.cleanTitle(title),
              summary: summary || `Article about ${title}`,
              url: cleanUrl,
              category: this.detectCategory($container),
              readTime: this.extractReadTime(containerText)
            });
          }
        }
      }
    });
    
    return articles;
  }

  private parseTextArticles(text: string): Article[] {
    const articles: Article[] = [];
    const lines = text.split('\n').map(line => line.trim()).filter(line => line);
    
    console.log('📄 Text parsing - analyzing text structure...');
    console.log(`📊 Total lines: ${lines.length}`);
    
    // Debug: Look for patterns that might be article titles
    let potentialTitles = 0;
    let minuteReadCount = 0;
    
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      
      // Check for "minute read" pattern (multiple formats)
      if (line.toLowerCase().includes('minute read') || line.includes('MINUTE READ') || /\d+\s*min\b/i.test(line)) {
        minuteReadCount++;
        console.log(`📖 Found minute read pattern: "${line.substring(0, 100)}..."`);
      }
      
      // Check for lines that might be titles (uppercase, short, followed by content)
      if (line.length > 20 && line.length < 120 && /^[A-Z]/.test(line)) {
        potentialTitles++;
        if (potentialTitles <= 3) {
          console.log(`📝 Potential title: "${line}"`);
        }
      }
      
      // Look for multiple minute read patterns
      let readTimeMatch = line.match(/^(.+?)\s*\((\d+)\s*minute\s*read\)/i);
      if (!readTimeMatch) {
        readTimeMatch = line.match(/^(.+?)\s*\((\d+)\s*MINUTE\s*READ\)/);
      }
      if (!readTimeMatch) {
        readTimeMatch = line.match(/^(.+?)\s*(\d+)\s*minute\s*read/i);
      }
      if (!readTimeMatch) {
        readTimeMatch = line.match(/^(.+?)\s*(\d+)\s*MINUTE\s*READ/);
      }
      
      if (readTimeMatch) {
        const title = readTimeMatch[1].trim();
        const readTime = `${readTimeMatch[2]} min`;
        
        let summary = '';
        for (let j = i + 1; j < Math.min(i + 5, lines.length); j++) {
          if (lines[j] && !this.looksLikeTitle(lines[j])) {
            summary += lines[j] + ' ';
            if (summary.length > 200) break;
          }
        }
        
        let url = '';
        for (let j = i - 2; j <= i + 2 && j < lines.length; j++) {
          if (j >= 0 && lines[j]) {
            const urlMatch = lines[j].match(/https?:\/\/[^\s]+/);
            if (urlMatch) {
              url = this.extractRealUrl(urlMatch[0]);
              if (url) break;
            }
          }
        }
        
        // Only add article if we found a valid URL and it's not sponsored content
        if (title.length > 10 && url) {
          const fullContext = `${title} ${summary}`;
          
          // Check if this is sponsored content
          if (this.isSponsoredContent(fullContext)) {
            console.log(`⚠️  Skipping sponsored content: "${title.substring(0, 50)}..."`);
          } else {
            articles.push({
              title: this.cleanTitle(title),
              summary: summary.trim() || `Article about ${title}`,
              url: url,
              readTime
            });
          }
        }
      }
    }
    
    console.log(`📈 Text parsing summary:`);
    console.log(`   - Potential titles found: ${potentialTitles}`);
    console.log(`   - "minute read" patterns found: ${minuteReadCount}`);
    console.log(`   - Articles extracted: ${articles.length}`);
    
    return articles;
  }

  private isAdminLink(href: string): boolean {
    const adminPatterns = [
      'tldr.tech/signup', 'tldr.tech/ai', 'advertise.tldr.tech', 
      'tldrnewsletter.com/web-version', 'tldrnewsletter.com/unsubscribe',
      'manage', 'feedback'
    ];
    return adminPatterns.some(pattern => href.includes(pattern));
  }


  private isArticleLink(href: string, title: string, debug: boolean = false): boolean {
    if (debug) {
      console.log(`\n🔍 Analyzing link: "${title}" -> ${href.substring(0, 100)}...`);
    }
    
    if (!href || !title) {
      if (debug) console.log(`   ❌ Missing href or title`);
      return false;
    }
    
    if (title.length < 3) {  // Reduced from 10 to 3 - TLDR links may have short or no titles
      if (debug) console.log(`   ❌ Title too short: ${title.length} chars`);
      return false;
    }
    
    const skipKeywords = [
      'unsubscribe', 'view online', 'sign up', 'advertise',
      'sponsor', 'together with', 'quick links', 'view in browser',
      'manage', 'feedback', 'tldr.tech/signup'
    ];
    
    const lowerTitle = title.toLowerCase();
    const matchedKeyword = skipKeywords.find(keyword => lowerTitle.includes(keyword));
    if (matchedKeyword) {
      if (debug) console.log(`   ❌ Contains skip keyword: "${matchedKeyword}"`);
      return false;
    }
    
    const matchedDomain = this.SKIP_DOMAINS.find(domain => href.includes(domain));
    if (matchedDomain) {
      if (debug) console.log(`   ❌ Contains skip domain: "${matchedDomain}"`);
      return false;
    }
    
    const hasTrackingUrl = href.includes(this.TRACKING_URL_PREFIX);
    const hasHttpUrl = href.match(/^https?:\/\//) !== null;
    
    if (debug) {
      console.log(`   🔗 Has tracking URL: ${hasTrackingUrl}`);
      console.log(`   🔗 Has HTTP URL: ${hasHttpUrl}`);
      console.log(`   ✅ Final result: ${hasTrackingUrl || hasHttpUrl}`);
    }
    
    return hasTrackingUrl || hasHttpUrl;
  }

  private extractRealUrl(trackingUrl: string): string {
    if (!trackingUrl) return '';
    
    console.log(`🔗 Extracting URL from: ${trackingUrl.substring(0, 100)}...`);
    
    // Handle TLDR tracking URLs
    if (trackingUrl.includes(this.TRACKING_URL_PREFIX)) {
      try {
        // TLDR uses pattern: https://tracking.tldrnewsletter.com/CL0/https:%2F%2Fexample.com%3Fparam%3Dvalue/tracking_id/hash
        const parts = trackingUrl.split('/CL0/');
        if (parts.length > 1) {
          // Get the encoded URL part (before the first '/' after CL0)
          const encodedPart = parts[1].split('/')[0];
          
          // Double decode the URL (TLDR uses URL encoding)
          let decodedUrl = decodeURIComponent(decodeURIComponent(encodedPart));
          
          // The decoded URL should now be a clean HTTP(S) URL
          // Extract the actual URL, handling various formats
          let realUrl = '';
          
          // Direct match for clean URLs
          const directMatch = decodedUrl.match(/^(https?:\/\/[^\s]+)/);
          if (directMatch) {
            realUrl = directMatch[1];
          } else {
            // Fallback: extract from any http/https pattern in the string
            const urlMatch = decodedUrl.match(/(https?:\/\/[^\s\?"']+)/);
            if (urlMatch) {
              realUrl = urlMatch[1];
            }
          }
          
          if (realUrl) {
            // Clean up the URL - remove tracking parameters
            try {
              const urlObj = new URL(realUrl);
              // Remove common tracking parameters
              const trackingParams = [
                'utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term',
                'utm_id', 'gclid', 'fbclid', 'mc_eid', 'mc_cid', '_hsenc', '_hsmi'
              ];
              trackingParams.forEach(param => {
                urlObj.searchParams.delete(param);
              });
              realUrl = urlObj.toString();
              
              // Remove trailing slash and clean up
              realUrl = realUrl.replace(/\/$/, '');
            } catch (urlError) {
              // If URL parsing fails, use the raw URL
              console.warn('URL parsing failed, using raw URL:', urlError);
            }
            
            // Make sure it's not a TLDR domain we should skip
            if (!this.SKIP_DOMAINS.some(domain => realUrl.toLowerCase().includes(domain.toLowerCase()))) {
              console.log(`✅ Successfully extracted URL: ${realUrl}`);
              return realUrl;
            } else {
              console.log(`⏭️  Skipping TLDR internal URL: ${realUrl}`);
            }
          }
        }
      } catch (error) {
        console.error('Error extracting URL from tracking link:', error);
      }
    }
    
    // Direct URL (not a tracking URL)
    if (trackingUrl.match(/^https?:\/\//)) {
      if (!this.SKIP_DOMAINS.some(domain => trackingUrl.toLowerCase().includes(domain.toLowerCase()))) {
        // Clean tracking parameters
        try {
          const urlObj = new URL(trackingUrl);
          const trackingParams = [
            'utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term',
            'utm_id', 'gclid', 'fbclid', 'mc_eid', 'mc_cid', '_hsenc', '_hsmi'
          ];
          trackingParams.forEach(param => {
            urlObj.searchParams.delete(param);
          });
          const cleanUrl = urlObj.toString().replace(/\/$/, '');
          console.log(`✅ Cleaned direct URL: ${cleanUrl}`);
          return cleanUrl;
        } catch {
          const cleanUrl = trackingUrl.split('?')[0].replace(/\/$/, '');
          console.log(`✅ Fallback URL cleaning: ${cleanUrl}`);
          return cleanUrl;
        }
      } else {
        console.log(`⏭️  Skipping blacklisted direct URL: ${trackingUrl}`);
      }
    }
    
    console.log(`❌ Could not extract valid URL from: ${trackingUrl.substring(0, 50)}...`);
    return '';
  }

  private cleanTitle(title: string): string {
    return title
      .replace(/^[^\w]+/, '')
      .replace(/\s+/g, ' ')
      .replace(/[🚀📱💻🎁⚡🔗📈🤖]/g, '')
      .trim();
  }

  private cleanSummary(text: string): string {
    if (!text) return '';
    
    // Remove TLDR promotional content and clean up the summary
    let cleaned = text
      .replace(/\s+/g, ' ')
      .trim();
    
    // Remove promotional phrases
    const promoPatterns = [
      /\(Sponsor\)/gi,
      /TLDR[\s\w]*newsletter/gi,
      /Sign up for[\s\w]*/gi,
      /Subscribe to[\s\w]*/gi,
      /Get this newsletter/gi,
      /Advertise with us/gi,
      /Together with[\s\w]*/gi,
      /Sponsored by[\s\w]*/gi,
      /Check out TLDR/gi,
      /Join.*TLDR/gi,
      /TLDR readers/gi,
      /exclusive.*TLDR/gi,
      /=[0-9A-F]{3,}(\s|$)/g, // Remove tracking codes
      /^\.+/, // Remove leading dots
      /\.{2,}/g, '.' // Replace multiple dots with single
    ];
    
    for (const pattern of promoPatterns) {
      cleaned = cleaned.replace(pattern, '').trim();
    }
    
    // Get complete sentences (not fragments)
    const sentences = this.extractCompleteSentences(cleaned);
    
    if (sentences.length > 0) {
      // Take first 2-3 complete sentences for summary
      const summary = sentences.slice(0, Math.min(3, sentences.length)).join(' ');
      return summary.length > 500 ? summary.substring(0, 497) + '...' : summary;
    }
    
    // Fallback: if no complete sentences, take first 300 chars but try to end at word boundary
    if (cleaned.length > 300) {
      const truncated = cleaned.substring(0, 300);
      const lastSpace = truncated.lastIndexOf(' ');
      return lastSpace > 200 ? truncated.substring(0, lastSpace) + '...' : truncated + '...';
    }
    
    return cleaned;
  }

  private extractCompleteSentences(text: string): string[] {
    // Split on sentence endings but keep the punctuation
    const rawSentences = text.match(/[^.!?]+[.!?]+/g) || [];
    
    const sentences: string[] = [];
    let currentSentence = '';
    
    for (const sentence of rawSentences) {
      const trimmed = sentence.trim();
      
      // Check if this looks like a complete sentence (has subject and verb indicators)
      if (this.isCompleteSentence(trimmed)) {
        if (currentSentence) {
          // Add accumulated partial sentence to previous complete one
          sentences[sentences.length - 1] += ' ' + currentSentence;
          currentSentence = '';
        }
        sentences.push(trimmed);
      } else {
        // Accumulate partial sentences
        currentSentence = currentSentence ? currentSentence + ' ' + trimmed : trimmed;
      }
    }
    
    // Add any remaining partial sentence to the last complete one
    if (currentSentence && sentences.length > 0) {
      sentences[sentences.length - 1] += ' ' + currentSentence;
    }
    
    return sentences.filter(s => s.length > 20); // Filter out very short fragments
  }

  private isCompleteSentence(text: string): boolean {
    // A complete sentence typically:
    // - Starts with a capital letter
    // - Has at least 20 characters
    // - Contains at least one verb-like pattern
    // - Ends with proper punctuation
    
    if (text.length < 20) return false;
    if (!/^[A-Z]/.test(text)) return false;
    if (!/[.!?]$/.test(text)) return false;
    
    // Check for verb indicators (simplified)
    const verbIndicators = [
      / is /i, / are /i, / was /i, / were /i, / will /i, / would /i,
      / has /i, / have /i, / had /i, / can /i, / could /i, / may /i,
      / might /i, / must /i, / should /i, / to /i, / said /i, / says /i,
      /ing /i, /ed /i
    ];
    
    return verbIndicators.some(pattern => pattern.test(text));
  }

  private isPromotionalContent(text: string): boolean {
    const lowerText = text.toLowerCase();
    
    // Skip if it's primarily promotional
    const promoKeywords = [
      'sponsor', 'advertisement', 'promoted', 'partnered with',
      'brought to you by', 'tldr newsletter', 'subscribe now',
      'sign up today', 'get tldr', 'join tldr', 'tldr readers get',
      'exclusive offer', 'special deal', 'limited time', 'act now'
    ];
    
    const matchCount = promoKeywords.filter(keyword => lowerText.includes(keyword)).length;
    
    // If multiple promotional keywords or the text is mostly promotional
    return matchCount >= 2 || 
           (matchCount >= 1 && text.length < 200) ||
           lowerText.includes('sponsor') && text.length < 100;
  }

  private extractSummaryFromText(text: string): string {
    return this.cleanSummary(text);
  }

  private extractReadTime(text: string): string | undefined {
    const match = text.match(/\((\d+)\s*minute\s*read\)/i);
    return match ? `${match[1]} min` : undefined;
  }

  private isSponsoredContent(text: string): boolean {
    const lowerText = text.toLowerCase();
    
    // Check for "sponsor" indicators instead of "minute read"
    const sponsorIndicators = [
      'sponsor', 'sponsored', 'advertisement', 'ad:', 'promoted',
      'partner content', 'paid content', 'brought to you by'
    ];
    
    const hasSponsorTag = sponsorIndicators.some(indicator => lowerText.includes(indicator));
    const hasMinuteRead = /\(\d+\s*minute\s*read\)/i.test(text);
    
    // If it has sponsor indicators but no minute read tag, it's likely sponsored content
    return hasSponsorTag && !hasMinuteRead;
  }

  // @ts-ignore
  private detectCategory($element: cheerio.Cheerio<cheerio.Element>): string | undefined {
    const text = $element.text().toLowerCase();
    const categories = [
      { key: 'ai', patterns: ['artificial intelligence', 'machine learning', 'llm', 'gpt', 'ai model', 'neural', 'deepmind', 'openai', 'anthropic'] },
      { key: 'big-tech', patterns: ['google', 'apple', 'microsoft', 'amazon', 'meta', 'facebook', 'tesla', 'nvidia'] },
      { key: 'startups', patterns: ['startup', 'funding', 'venture', 'founder', 'series a', 'series b', 'ipo', 'acquisition'] },
      { key: 'programming', patterns: ['programming', 'coding', 'javascript', 'python', 'github', 'api', 'framework', 'developer'] },
      { key: 'science', patterns: ['research', 'quantum', 'physics', 'biology', 'chemistry', 'discovery', 'experiment'] },
      { key: 'security', patterns: ['security', 'cybersecurity', 'hack', 'vulnerability', 'breach', 'encryption', 'privacy'] }
    ];
    
    for (const cat of categories) {
      if (cat.patterns.some(pattern => text.includes(pattern))) {
        return cat.key;
      }
    }
    
    return undefined;
  }

  private looksLikeTitle(text: string): boolean {
    return text.length < 150 && 
           /^[A-Z]/.test(text) && 
           (text.includes('minute read') || /^[A-Z][^.!?]*$/.test(text));
  }

  private similarity(str1: string, str2: string): number {
    const s1 = str1.toLowerCase();
    const s2 = str2.toLowerCase();
    
    if (s1 === s2) return 1;
    if (s1.includes(s2) || s2.includes(s1)) return 0.9;
    
    const words1 = new Set(s1.split(/\s+/));
    const words2 = new Set(s2.split(/\s+/));
    const intersection = [...words1].filter(w => words2.has(w));
    
    return intersection.length / Math.max(words1.size, words2.size);
  }

  private deduplicateArticles(articles: Article[]): Article[] {
    const unique: Article[] = [];
    const seen = new Set<string>();
    
    for (const article of articles) {
      const key = article.url || article.title.toLowerCase();
      if (!seen.has(key)) {
        seen.add(key);
        
        const similar = unique.find(u => this.similarity(u.title, article.title) > 0.8);
        if (!similar) {
          unique.push(article);
        }
      }
    }
    
    return unique;
  }

  private slugify(text: string): string {
    return text
      .toLowerCase()
      .replace(/[^\w\s-]/g, '')
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-')
      .trim();
  }

  getStatus() {
    return {
      configured: !!(this.imapConfig.user && this.imapConfig.password),
      user: this.imapConfig.user || 'not configured',
      host: this.imapConfig.host
    };
  }
}

export const emailProcessor = new EmailProcessor();
export default emailProcessor;