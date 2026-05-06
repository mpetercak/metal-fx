import { useEffect, useRef, useState } from 'react';
import { MetalFx, type MetalFxPreset, type MetalFxTheme, type MetalFxVariant } from '../src';

const PRESETS: MetalFxPreset[] = ['chromatic', 'silver', 'gold'];
const VARIANTS: MetalFxVariant[] = ['button', 'circle'];

const ArrowUpIcon = () => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M8 12V4M4 7l4-4 4 4" />
  </svg>
);

const ChevronIcon = () => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M6 4l4 4-4 4" />
  </svg>
);

const SearchIcon = () => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <circle cx="7" cy="7" r="4.5" />
    <path d="M10.5 10.5L14 14" />
  </svg>
);

function buildSnippet(variant: MetalFxVariant, preset: MetalFxPreset, strength: number, paused: boolean) {
  const props = [`preset="${preset}"`];
  if (variant !== 'button') props.push(`variant="${variant}"`);
  if (strength !== 1) props.push(`strength={${strength.toFixed(2)}}`);
  if (paused) props.push('paused');

  const isCircle = variant === 'circle';
  const child = isCircle
    ? `  <button aria-label="Send"><ArrowUpIcon /></button>`
    : `  <button>Upgrade to Pro</button>`;

  return `<MetalFx ${props.join(' ')}>\n${child}\n</MetalFx>`;
}

export function App() {
  const [theme, setTheme] = useState<MetalFxTheme>('dark');
  const [variant, setVariant] = useState<MetalFxVariant>('button');
  const [preset, setPreset] = useState<MetalFxPreset>('chromatic');
  const [strength, setStrength] = useState(1);
  const [paused, setPaused] = useState(false);
  const [copied, setCopied] = useState(false);

  const searchRef = useRef<HTMLDivElement>(null);
  const dotsRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
  }, [theme]);

  const toggleTheme = () => setTheme((t) => (t === 'dark' ? 'light' : 'dark'));

  const snippet = buildSnippet(variant, preset, strength, paused);

  const handleCopy = () => {
    navigator.clipboard.writeText(snippet);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  const handleStrengthInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value.replace('%', '');
    const n = parseInt(raw, 10);
    if (!Number.isNaN(n)) setStrength(Math.max(0, Math.min(100, n)) / 100);
  };

  return (
    <div className="pg-page">
      {/* Header */}
      <div className="pg-header">
        <h1 className="pg-title">Playground</h1>
        <button type="button" className="tab-btn" onClick={toggleTheme}>
          {theme === 'dark' ? '☀ Light' : '● Dark'}
        </button>
      </div>

      {/* Controls toolbar */}
      <div className="pg-toolbar">
        <div className="pg-control-group">
          <span className="pg-control-group-label">Type</span>
          <div className="pg-toggle-row" role="radiogroup" aria-label="Variant type">
            {VARIANTS.map((v) => (
              <button
                key={v}
                type="button"
                className={`tab-btn${variant === v ? ' active' : ''}`}
                onClick={() => setVariant(v)}
              >
                {v.charAt(0).toUpperCase() + v.slice(1)}
              </button>
            ))}
          </div>
        </div>

        <div className="pg-control-group">
          <span className="pg-control-group-label">Color</span>
          <div className="pg-toggle-row" role="radiogroup" aria-label="Color preset">
            {PRESETS.map((p) => (
              <button
                key={p}
                type="button"
                className={`tab-btn${preset === p ? ' active' : ''}`}
                onClick={() => setPreset(p)}
              >
                {p.charAt(0).toUpperCase() + p.slice(1)}
              </button>
            ))}
          </div>
        </div>

        <div className="pg-control-group">
          <label htmlFor="pg-strength">Strength</label>
          <input
            id="pg-strength"
            className="pg-strength-input"
            value={`${Math.round(strength * 100)}%`}
            onChange={handleStrengthInput}
          />
        </div>
      </div>

      {/* Preview card */}
      <div className="pg-preview">
        <MetalFx
          key={`${variant}-${preset}`}
          preset={preset}
          variant={variant}
          theme={theme}
          strength={strength}
          paused={paused}
        >
          {variant === 'circle' ? (
            <button type="button" className="demo-circle">
              <ArrowUpIcon />
            </button>
          ) : (
            <button type="button" className="demo-pill">
              Upgrade to Pro
            </button>
          )}
        </MetalFx>

        <button
          type="button"
          className="pg-pause-btn"
          onClick={() => setPaused((p) => !p)}
          title={paused ? 'Resume' : 'Pause'}
        >
          {paused ? '▶' : '❚❚'}
        </button>
      </div>

      {/* Code snippet */}
      <div className="pg-code">
        {snippet}
        <button type="button" className="pg-copy-btn" onClick={handleCopy} title="Copy">
          {copied ? '✓' : '⎘'}
        </button>
      </div>

      {/* Examples */}
      <hr className="pg-divider" />
      <h2 className="section-title" style={{ marginBottom: 16 }}>Examples</h2>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        {/* Chat input mock */}
        <div className="example-card">
          <div className="mock-chat">
            <input className="mock-chat-input" placeholder="Build anything..." readOnly />
            <div className="mock-chat-row">
              <div className="mock-plus-btn">+</div>
              <div style={{ flex: 1 }} />
              <div className="mock-chip">Agent <ChevronIcon /></div>
              <div className="mock-chip">Auto <ChevronIcon /></div>
              <MetalFx preset="gold" variant="circle" theme={theme}>
                <button type="button" className="demo-circle" style={{ width: 36, height: 36, borderRadius: 18 }}>
                  <ArrowUpIcon />
                </button>
              </MetalFx>
            </div>
          </div>
        </div>

        {/* Toolbar row mock */}
        <div className="example-card">
          <div className="ui-row">
            <div className="mock-search" ref={searchRef}>
              <SearchIcon />
              <span>Search</span>
            </div>
            <MetalFx
              preset="chromatic"
              theme={theme}
              reflectionTargets={[searchRef, dotsRef]}
            >
              <button type="button" className="demo-pill">Upgrade to Pro</button>
            </MetalFx>
            <button type="button" className="mock-dots" ref={dotsRef}>···</button>
          </div>
        </div>
      </div>
    </div>
  );
}
