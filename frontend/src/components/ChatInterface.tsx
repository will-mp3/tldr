import React, { useState } from 'react';
import './ChatInterface.css';

interface Message {
  id: string;
  text: string;
  isUser: boolean;
  timestamp: Date;
}

const ChatInterface: React.FC = () => {
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputText, setInputText] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const handleSendMessage = async () => {
    if (!inputText.trim()) return;

    const userMessage: Message = {
      id: Date.now().toString(),
      text: inputText,
      isUser: true,
      timestamp: new Date()
    };

    setMessages(prev => [...prev, userMessage]);
    setInputText('');
    setIsLoading(true);

    // TODO: Replace with actual API call in Phase 5
    setTimeout(() => {
      const botMessage: Message = {
        id: (Date.now() + 1).toString(),
        text: 'This is a placeholder response. Chat functionality will be connected in Phase 5.',
        isUser: false,
        timestamp: new Date()
      };
      setMessages(prev => [...prev, botMessage]);
      setIsLoading(false);
    }, 1000);
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  return (
    <div className="chat-interface">
      <div className="chat-header">
        <h2>Dont Get Left Behind</h2>
        <p>Ask me about recent tech news and developments</p>
      </div>
      
      <div className="chat-messages">
        {messages.length === 0 && (
          <div className="empty-state">
            <p>👋 Hi! I'm your tech news assistant. Ask me about recent developments in tech, AI, or any topics from the newsletters.</p>
          </div>
        )}
        {messages.map(message => (
          <div 
            key={message.id} 
            className={`message ${message.isUser ? 'user' : 'bot'}`}
          >
            <div className="message-content">
              {message.text}
            </div>
            <div className="message-time">
              {message.timestamp.toLocaleTimeString()}
            </div>
          </div>
        ))}
        {isLoading && (
          <div className="message bot">
            <div className="message-content">
              <div className="typing-indicator">
                <span></span>
                <span></span>
                <span></span>
              </div>
            </div>
          </div>
        )}
      </div>

      <div className="chat-input">
        <textarea
          value={inputText}
          onChange={(e) => setInputText(e.target.value)}
          onKeyDown={handleKeyPress}
          placeholder="Ask about recent tech news..."
          rows={3}
          disabled={isLoading}
        />
        <button 
          onClick={handleSendMessage}
          disabled={!inputText.trim() || isLoading}
          className="send-button"
        >
          Send
        </button>
      </div>
    </div>
  );
};

export default ChatInterface;