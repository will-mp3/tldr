import React from 'react';
import { Coffee } from 'lucide-react';
import './Layout.css';

interface LayoutProps {
  children: React.ReactNode;
}

const Layout: React.FC<LayoutProps> = ({ children }) => {
  return (
    <div className="layout">
      <header className="header">
        <div className="header-content">
          <div className="header-title-container">
            <Coffee size={24} className="header-icon" />
            <h1 className="header-title">TLDR</h1>
          </div>
          <button className="sign-out-btn">
            Sign Out
          </button>
        </div>
      </header>
      <main className="main-content">
        {children}
      </main>
    </div>
  );
};

export default Layout;