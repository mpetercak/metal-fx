import React from 'react';
import type { Theme } from '../hooks/useTheme';
import { GitHubIcon, XIcon } from './icons';

export function Header({ theme, onToggleTheme, disableGlow, onToggleGlow }: { theme: Theme; onToggleTheme: () => void; disableGlow: boolean; onToggleGlow: () => void }) {
  return (
    <header className="header">
      <nav className="top-bar-links" aria-label="External links">
        <a className="icon-btn" href="https://github.com/Jakubantalik/metal-fx" target="_blank" rel="noopener noreferrer" aria-label="GitHub repository">
          <GitHubIcon />
        </a>
        <a className="icon-btn" href="https://x.com/jakubantalik" target="_blank" rel="noopener noreferrer" aria-label="Follow on X (Twitter)">
          <XIcon />
        </a>
        <button className="icon-btn" type="button" onClick={onToggleGlow} aria-label="Toggle glow" aria-pressed={!disableGlow} title={disableGlow ? 'Enable glow' : 'Disable glow'}>
          <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ opacity: disableGlow ? 0.4 : 1 }}>
            <circle cx="12" cy="12" r="5" />
            <line x1="12" y1="1" x2="12" y2="3" />
            <line x1="12" y1="21" x2="12" y2="23" />
            <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" />
            <line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
            <line x1="1" y1="12" x2="3" y2="12" />
            <line x1="21" y1="12" x2="23" y2="12" />
            <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" />
            <line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
          </svg>
        </button>
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
