import React, { useRef } from 'react';
import { MetalFx } from '../../src';
import type { Theme } from '../hooks/useTheme';
import { ArrowUpIcon, ChevronDownIcon, DotsIcon, PlusIcon, SearchIcon18 } from './icons';

export function Examples({ theme, disableGlow }: { theme: Theme; disableGlow: boolean }) {
  const searchRef = useRef<HTMLLabelElement>(null);
  const dotsRef = useRef<HTMLButtonElement>(null);

  return (
    <section className="examples-section" aria-label="Effect demonstrations">
      {/* Chat input mock */}
      <div className="example-row-full">
        <div className="mock-chat">
          <textarea
            className="mock-chat-input"
            placeholder="Build anything..."
            rows={1}
            spellCheck={false}
            aria-label="Build anything..."
          />
          <div className="mock-chat-row">
            <div className="mock-plus-btn"><PlusIcon /></div>
            <div style={{ flex: 1 }} />
            <div className="mock-chip"><span>Agent</span><ChevronDownIcon /></div>
            <div className="mock-chip"><span>Auto</span><ChevronDownIcon /></div>
            <MetalFx preset="gold" variant="circle" theme={theme} disableGlow={disableGlow}>
              <button type="button" className="demo-circle">
                <ArrowUpIcon />
              </button>
            </MetalFx>
          </div>
        </div>
      </div>

      {/* Toolbar row */}
      <div className="example-row-full tall">
        <div className="hero-toolbar" role="group" aria-label="Hero toolbar">
          <label className="hero-toolbar-search" ref={searchRef}>
            <SearchIcon18 />
            <input
              className="hero-toolbar-search-input"
              type="search"
              placeholder="Search"
              spellCheck={false}
              aria-label="Search"
            />
          </label>

          <MetalFx preset="chromatic" theme={theme} disableGlow={disableGlow} reflectionTargets={[searchRef, dotsRef]}>
            <button type="button" className="demo-pill">Upgrade to Pro</button>
          </MetalFx>

          <button className="hero-toolbar-icon-btn" type="button" ref={dotsRef} aria-label="More options">
            <DotsIcon />
          </button>
        </div>
      </div>
    </section>
  );
}
