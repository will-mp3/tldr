-- Enable PGVector extension
CREATE EXTENSION IF NOT EXISTS vector;

-- Create articles table with vector support
CREATE TABLE articles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title VARCHAR(500) NOT NULL,
    summary TEXT NOT NULL,
    content TEXT,
    source_url VARCHAR(1000) NOT NULL,
    newsletter_source VARCHAR(100) NOT NULL,
    published_date TIMESTAMP NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    -- Vector embeddings (using OpenAI's 1536 dimensions)
    title_embedding vector(1536),
    summary_embedding vector(1536),
    content_embedding vector(1536),
    
    -- TTL for cleanup (7 days)
    expires_at TIMESTAMP DEFAULT (CURRENT_TIMESTAMP + INTERVAL '7 days')
);

-- Create indexes for better performance
CREATE INDEX articles_newsletter_source_idx ON articles(newsletter_source);
CREATE INDEX articles_published_date_idx ON articles(published_date DESC);
CREATE INDEX articles_expires_at_idx ON articles(expires_at);

-- Vector similarity indexes (using cosine distance)
CREATE INDEX articles_title_embedding_idx ON articles 
USING ivfflat (title_embedding vector_cosine_ops) WITH (lists = 100);

CREATE INDEX articles_summary_embedding_idx ON articles 
USING ivfflat (summary_embedding vector_cosine_ops) WITH (lists = 100);

CREATE INDEX articles_content_embedding_idx ON articles 
USING ivfflat (content_embedding vector_cosine_ops) WITH (lists = 100);

-- Create users table for basic auth (local development)
CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email VARCHAR(255) UNIQUE NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    last_login TIMESTAMP,
    status VARCHAR(50) DEFAULT 'active'
);

-- Insert some sample data for testing
INSERT INTO articles (title, summary, content, source_url, newsletter_source, published_date) VALUES
(
    'OpenAI Releases GPT-4 Turbo with Improved Performance',
    'OpenAI has announced GPT-4 Turbo, featuring enhanced performance and lower costs for developers building AI applications.',
    'OpenAI today unveiled GPT-4 Turbo, the latest iteration of their flagship language model. The new model offers significant improvements in performance while reducing costs for developers. Key features include a larger context window, updated knowledge cutoff, and improved instruction following.',
    'https://openai.com/blog/gpt-4-turbo',
    'tldr_ai',
    CURRENT_TIMESTAMP - INTERVAL '2 hours'
),
(
    'Meta Introduces Code Llama 70B for Advanced Programming Tasks',
    'Meta has released Code Llama 70B, a large language model specifically designed for code generation and programming assistance.',
    'Meta AI has launched Code Llama 70B, their most powerful code generation model to date. The model demonstrates exceptional performance on programming benchmarks and supports multiple programming languages including Python, JavaScript, TypeScript, and more.',
    'https://ai.meta.com/blog/code-llama-70b',
    'tldr_ai',
    CURRENT_TIMESTAMP - INTERVAL '4 hours'
),
(
    'Google Announces Gemini Pro with Multimodal Capabilities',
    'Google has unveiled Gemini Pro, featuring advanced multimodal AI capabilities that can process text, images, and audio simultaneously.',
    'Google DeepMind has announced Gemini Pro, their latest multimodal AI model that can understand and generate content across text, images, and audio. The model shows impressive performance on various benchmarks and is now available through Google AI Studio.',
    'https://blog.google/technology/ai/google-gemini-ai',
    'tldr_base',
    CURRENT_TIMESTAMP - INTERVAL '6 hours'
);

-- Function to automatically update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Trigger to automatically update updated_at
CREATE TRIGGER update_articles_updated_at 
    BEFORE UPDATE ON articles 
    FOR EACH ROW 
    EXECUTE FUNCTION update_updated_at_column();