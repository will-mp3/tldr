# Tech Newsletter RAG Tool

A smart aggregation tool that helps software engineers stay current on tech and AI news through intelligent chat and curated newsletter browsing.

## 🚀 Overview

This tool processes TLDR newsletters daily, extracts article content, and provides both AI-powered chat and manual browsing interfaces for efficient tech news consumption. Perfect for busy developers who want to stay informed during their coffee breaks.

## ✨ Features

- **Smart Chat Interface**: Ask questions about recent tech news and get intelligent summaries
- **Curated Content**: Automatically processes TLDR newsletter family (AI, Base, Crypto, etc.)
- **Article Enrichment**: Scrapes full article content while displaying clean summaries
- **Clean Interface**: Distraction-free design focused on information consumption
- **Cost Optimized**: Runs efficiently on AWS with predictable costs (~$25-45/month)

## 🏗️ Architecture

### Tech Stack
- **Frontend**: React + TypeScript
- **Backend**: Node.js + Express on AWS Lambda
- **Database**: PostgreSQL with PGVector (for vector embeddings)
- **AI**: OpenAI GPT-4o Mini
- **Storage**: AWS S3 with 7-day TTL
- **Auth**: AWS Cognito

### Key Components
- **Email Processor**: Daily newsletter ingestion via IMAP
- **Content Scraper**: Ethical web scraping with graceful failure handling
- **Vector Search**: Semantic search across article corpus
- **Chat Interface**: RAG-powered conversational interface

## 📊 Data Flow

1. **Daily Processing**: Lambda function scrapes newsletters at 10 AM
2. **Content Extraction**: Parses headlines, summaries, and source URLs
3. **Article Scraping**: Fetches full article content when accessible
4. **Vector Storage**: Generates embeddings and stores in PostgreSQL
5. **User Interface**: Chat queries and manual browsing of chronological articles

## 🛠️ Setup & Installation

### Prerequisites
- Node.js 18+
- AWS CLI configured
- PostgreSQL with PGVector extension
- OpenAI API key

## 📁 Project Structure

```
├── src/
│   ├── components/          # React components
│   │   ├── ChatInterface/
│   │   ├── ArticleCards/
│   │   └── Layout/
│   ├── services/           # Business logic
│   │   ├── emailProcessor.js
│   │   ├── webScraper.js
│   │   ├── vectorSearch.js
│   │   └── chatService.js
│   ├── utils/              # Helper functions
│   ├── hooks/              # React hooks
│   └── types/              # TypeScript definitions
├── lambda/                 # AWS Lambda functions
│   ├── emailProcessor/
│   ├── articleScraper/
│   └── chatApi/
├── database/               # Database schemas and migrations
├── infrastructure/         # AWS CDK/CloudFormation
└── docs/                  # Additional documentation
```

## 🔧 Configuration

### Content Retention
- **Storage Period**: 7 days rolling window
- **Article Volume**: ~350-500 articles per week
- **Cleanup**: Automatic daily cleanup of expired content

## 💰 Cost Breakdown

| Component | Monthly Cost |
|-----------|-------------|
| RDS PostgreSQL | $15-25 |
| Lambda Functions | $1-5 |
| DynamoDB | $1-3 |
| S3 Storage | $1-2 |
| OpenAI API | $3-8 |
| **Total** | **$25-45** |

## 🔒 Security & Privacy

- **Minimal Data Collection**: Only stores user credentials and public article content
- **Ethical Scraping**: Respects robots.txt and implements proper rate limiting
- **Secure Authentication**: AWS Cognito with invite-only user management
- **No Personal Data**: No tracking or analytics on user behavior

## 📱 Usage

### Chat Interface
- Ask for daily summaries: "What were the key AI developments today?"
- Get article details: "Tell me more about that new framework"
- Explore topics: "What's the latest on OpenAI?"

### Manual Browsing
- Scroll through chronological article cards
- Click article titles to read full content on original sites
- Browse TLDR summaries for quick information consumption

## 🤝 Contributing

This is primarily a personal/team tool, but contributions are welcome:

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests if applicable
5. Submit a pull request

## 📄 License

This project is licensed under the MIT License - see the LICENSE file for details.

## 🙋‍♂️ Support

For questions or issues:
- Check the documentation in `/docs`
- Review the project specifications
- Open an issue for bugs or feature requests

## 🎯 Roadmap

- [x] Core newsletter processing
- [x] Chat interface with RAG
- [x] Article scraping pipeline
- [ ] Mobile responsiveness improvements
- [ ] Enhanced error monitoring
- [ ] Performance optimizations
- [ ] Public demo mode

---

Built for developers, by developers. Stay current without the noise. ☕
