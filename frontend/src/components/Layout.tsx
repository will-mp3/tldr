import React from 'react';
import './Layout.css';

interface LayoutProps {
  children: React.ReactNode;
}

const Layout: React.FC<LayoutProps> = ({ children }) => {
  return (
    <div className="layout">
      <header className="header">
        <div className="header-content">
          <h1 className="header-title">TLDR</h1>
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