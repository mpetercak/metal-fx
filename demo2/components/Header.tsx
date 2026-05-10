import React from 'react';
import type { Theme } from '../hooks/useTheme';
import { GitHubIcon, XIcon } from './icons';

export function Header({ theme, onToggleTheme }: { theme: Theme; onToggleTheme: () => void }) {
  return (
    <header className="header">
      <nav className="top-bar-links" aria-label="External links">
        <a className="icon-btn" href="https://github.com/Jakubantalik/metal-fx" target="_blank" rel="noopener noreferrer" aria-label="GitHub repository">
          <GitHubIcon />
        </a>
        <a className="icon-btn" href="https://x.com/jakubantalik" target="_blank" rel="noopener noreferrer" aria-label="Follow on X (Twitter)">
          <XIcon />
        </a>
        <button className="icon-btn" type="button" onClick={onToggleTheme} aria-label="Toggle theme">
          <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
            {theme === 'dark' ? (
              <path d="M12 3a9 9 0 109 9c0-.46-.04-.92-.1-1.36a5.39 5.39 0 01-4.4 2.26 5.4 5.4 0 01-3.14-9.8A9.06 9.06 0 0012 3z" />
            ) : (
              <path d="M12 2v2m0 16v2M4.93 4.93l1.41 1.41m11.32 11.32l1.41 1.41M2 12h2m16 0h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41M12 6a6 6 0 100 12 6 6 0 000-12z" />
            )}
          </svg>
        </button>
      </nav>
      <div className="header-icon" aria-hidden="true">
        <img
          className="header-icon-img"
          src={theme === 'dark' ? '/header.png' : '/header-light.png'}
          alt=""
          width="207"
          height="138"
          decoding="async"
        />
      </div>
      <h1 className="title">Liquid metal</h1>
      <p className="subtitle-sm">Animated liquid metal border component</p>
    </header>
  );
}
