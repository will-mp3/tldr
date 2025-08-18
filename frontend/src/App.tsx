import React from 'react';
import Layout from './components/Layout';
import ChatInterface from './components/ChatInterface';
import ArticleCards from './components/ArticleCards';
import './App.css';

function App() {
  return (
    <Layout>
      <div className="app-container">
        <div className="chat-section">
          <ChatInterface />
        </div>
        <div className="articles-section">
          <ArticleCards />
        </div>
      </div>
    </Layout>
  );
}

export default App;