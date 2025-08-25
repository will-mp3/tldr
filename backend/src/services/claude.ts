import Anthropic from '@anthropic-ai/sdk';
import { Article } from './database';

interface ChatResponse {
  response: string;
  sources: Article[];
  tokens_used?: number;
  processing_time: number;
}

class ClaudeService {
  private anthropic: Anthropic | null = null;
  private enabled: boolean = false;

  constructor() {
    this.initializeClaude();
  }

  private initializeClaude(): void {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    
    if (!apiKey) {
      console.log('⚠️  Anthropic API key not found. Chat responses will use fallback mode.');
      this.enabled = false;
      return;
    }

    try {
      this.anthropic = new Anthropic({ apiKey });
      this.enabled = true;
      console.log('✅ Claude service initialized successfully');
    } catch (error) {
      console.error('❌ Failed to initialize Claude:', error);
      this.enabled = false;
    }
  }

  async generateChatResponse(
    userQuery: string, 
    contextArticles: Article[] = []
  ): Promise<ChatResponse> {
    const startTime = Date.now();

    // Fallback response if Claude is not enabled
    if (!this.enabled || !this.anthropic) {
      return this.generateFallbackResponse(userQuery, contextArticles, startTime);
    }

    try {
      // Build context from articles
      const context = this.buildContext(contextArticles);
      
      // Create system prompt
      const systemPrompt = this.buildSystemPrompt();
      
      // Create user prompt with context
      const userPrompt = context 
        ? `Context from recent articles:\n${context}\n\nUser question: ${userQuery}`
        : `User question: ${userQuery}`;

      // Generate response using Claude Haiku
      const message = await this.anthropic.messages.create({
        model: 'claude-3-haiku-20240307',
        max_tokens: 500,
        temperature: 0.7,
        system: systemPrompt,
        messages: [
          { role: 'user', content: userPrompt }
        ]
      });

      // Extract response text
      const responseContent = message.content[0];
      const response = responseContent.type === 'text' 
        ? responseContent.text 
        : 'Sorry, I could not generate a response.';

      const tokensUsed = message.usage?.input_tokens + message.usage?.output_tokens || 0;
      const processingTime = Date.now() - startTime;

      return {
        response,
        sources: contextArticles,
        tokens_used: tokensUsed,
        processing_time: processingTime
      };

    } catch (error) {
      console.error('❌ Claude API error:', error);
      return this.generateFallbackResponse(userQuery, contextArticles, startTime);
    }
  }

  private generateFallbackResponse(
    userQuery: string, 
    contextArticles: Article[], 
    startTime: number
  ): ChatResponse {
    const processingTime = Date.now() - startTime;
    
    // Generate intelligent fallback based on context
    let response = `I'd be happy to help with your question about "${userQuery}".`;
    
    if (contextArticles.length > 0) {
      const topics = contextArticles.map(a => a.title).slice(0, 3);
      response += ` Based on recent articles, I found information about: ${topics.join(', ')}. `;
      response += `Here are some key points from the articles that might be relevant to your question.`;
    } else {
      response += ` I don't have specific recent articles that match your query, but I can provide general information.`;
    }
    
    response += `\n\n(Note: Claude integration is not enabled. Add ANTHROPIC_API_KEY to your .env file for enhanced responses.)`;

    return {
      response,
      sources: contextArticles,
      processing_time: processingTime
    };
  }

  private buildSystemPrompt(): string {
    return `You are a helpful tech news assistant for TLDR, a tech newsletter aggregation service. 

Your role:
- Help users understand recent tech news and developments
- Provide concise, informative responses about technology trends
- Reference specific articles when available in the context
- Focus on practical insights and implications
- Keep responses conversational and accessible

Guidelines:
- Always base responses on the provided article context when available
- If no relevant context is provided, acknowledge this and provide general guidance
- Keep responses concise but informative (aim for 2-3 paragraphs max)
- When referencing articles, mention the source (e.g., "According to a recent article...")
- Focus on helping busy developers and tech professionals stay informed
- If asked about topics outside of tech/AI, politely redirect to tech-related topics

Style: Professional but conversational, like a knowledgeable colleague sharing insights over coffee.`;
  }

  private buildContext(articles: Article[]): string {
    if (articles.length === 0) return '';
    
    const contextParts = articles.slice(0, 5).map(article => {
      return `Title: ${article.title}
Summary: ${article.summary}
Source: ${article.newsletter_source}
Published: ${new Date(article.published_date).toLocaleDateString()}
---`;
    });

    return contextParts.join('\n');
  }

  // Test Claude connection
  async testConnection(): Promise<boolean> {
    if (!this.enabled || !this.anthropic) {
      return false;
    }

    try {
      await this.anthropic.messages.create({
        model: 'claude-3-haiku-20240307',
        max_tokens: 5,
        messages: [{ role: 'user', content: 'Hello' }]
      });
      return true;
    } catch (error) {
      console.error('❌ Claude connection test failed:', error);
      return false;
    }
  }

  // Get service status
  getStatus() {
    return {
      enabled: this.enabled,
      model: 'claude-3-haiku-20240307',
      ready: this.enabled && this.anthropic !== null,
      fallback_mode: !this.enabled
    };
  }
}

// Create singleton instance
export const claudeService = new ClaudeService();

export default claudeService;