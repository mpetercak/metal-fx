import { useEffect, useRef, useState, type ReactNode } from 'react';
import { MetalFx, type MetalFxPreset, type MetalFxTheme, type MetalFxVariant } from '../src';
import { PureCss } from './variants/PureCss';
import { ShaderMinimal } from './variants/ShaderMinimal';
import { ShaderCssGlow } from './variants/ShaderCssGlow';

const PRESETS: MetalFxPreset[] = ['chromatic', 'silver', 'gold'];

function useFps() {
  const [fps, setFps] = useState(0);
  const frames = useRef(0);
  const lastMs = useRef(performance.now());

  useEffect(() => {
    let rafId = 0;
    const tick = (now: number) => {
      frames.current++;
      if (now - lastMs.current >= 1000) {
        setFps(frames.current);
        frames.current = 0;
        lastMs.current = now;
      }
      rafId = requestAnimationFrame(tick);
    };
    rafId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId);
  }, []);

  return fps;
}

function FpsBadge() {
  const fps = useFps();
  return (
    <span style={{
      display: 'inline-block',
      padding: '2px 8px',
      borderRadius: 4,
      fontSize: 11,
      fontWeight: 600,
      fontFamily: "'Roboto Mono', monospace",
      background: fps >= 50 ? 'rgba(80,200,80,0.15)' : fps >= 30 ? 'rgba(255,200,50,0.15)' : 'rgba(255,80,80,0.15)',
      color: fps >= 50 ? '#6c6' : fps >= 30 ? '#ca6' : '#f66',
      letterSpacing: '0.5px',
    }}>
      {fps} fps
    </span>
  );
}

interface VariantCardProps {
  title: string;
  subtitle: string;
  children: ReactNode;
}

function VariantCard({ title, subtitle, children }: VariantCardProps) {
  return (
    <div style={{
      borderRadius: 16,
      background: 'var(--surface)',
      border: '1px solid var(--panel-border)',
      boxShadow: 'var(--card-shadow)',
      padding: '24px 20px',
      display: 'flex',
      flexDirection: 'column',
      gap: 12,
      minHeight: 200,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--heading-fg)' }}>{title}</div>
          <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>{subtitle}</div>
        </div>
        <FpsBadge />
      </div>
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 16, flexWrap: 'wrap' }}>
        {children}
      </div>
    </div>
  );
}

const ArrowUpIcon = () => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M8 12V4M4 7l4-4 4 4" />
  </svg>
);

interface CompareViewProps {
  theme: MetalFxTheme;
}

export function CompareView({ theme }: CompareViewProps) {
  const [preset, setPreset] = useState<MetalFxPreset>('chromatic');
  const [variant, setVariant] = useState<MetalFxVariant>('button');
  const [disableGlow, setDisableGlow] = useState(false);
  const [disableReflections, setDisableReflections] = useState(false);

  const resolvedTheme = theme === 'auto' ? 'dark' : theme;

  const pillBtn = (
    <button type="button" className="demo-pill">
      Upgrade to Pro
    </button>
  );

  const circleBtn = (
    <button type="button" className="demo-circle">
      <ArrowUpIcon />
    </button>
  );

  const renderChild = () => variant === 'circle' ? circleBtn : pillBtn;

  return (
    <div>
      <div style={{ display: 'flex', gap: 16, alignItems: 'center', marginBottom: 20, flexWrap: 'wrap' }}>
        <div className="pg-toggle-row" role="radiogroup">
          {(['button', 'circle'] as MetalFxVariant[]).map((v) => (
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

        <div className="pg-toggle-row" role="radiogroup">
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

        <label style={{ fontSize: 12, color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
          <input type="checkbox" checked={disableGlow} onChange={(e) => setDisableGlow(e.target.checked)} />
          No glow
        </label>
        <label style={{ fontSize: 12, color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
          <input type="checkbox" checked={disableReflections} onChange={(e) => setDisableReflections(e.target.checked)} />
          No reflections
        </label>
      </div>

      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(2, 1fr)',
        gap: 16,
      }}>
        <VariantCard title="Current (Full)" subtitle="WebGL + SVG glow + canvas reflections">
          <MetalFx
            key={`full-${variant}-${preset}`}
            preset={preset}
            variant={variant}
            theme={theme}
            disableGlow={disableGlow}
          >
            {renderChild()}
          </MetalFx>
        </VariantCard>

        <VariantCard title="Pure CSS" subtitle="conic-gradient + @property, zero JS animation">
          <PureCss
            preset={preset}
            theme={resolvedTheme}
            variant={variant}
            disableGlow={disableGlow}
            disableReflections
          >
            {renderChild()}
          </PureCss>
        </VariantCard>

        {/* <VariantCard title="Level 2: Shader Minimal" subtitle="WebGL ring only, no glow / reflections">
          <ShaderMinimal
            key={`min-${variant}-${preset}`}
            preset={preset}
            theme={resolvedTheme}
            variant={variant}
          >
            {renderChild()}
          </ShaderMinimal>
        </VariantCard> */}

        {/* <VariantCard title="Level 3: Shader + CSS Effects" subtitle="WebGL ring + CSS glow + CSS box-shadow spill">
          <ShaderCssGlow
            key={`css-${variant}-${preset}`}
            preset={preset}
            theme={resolvedTheme}
            variant={variant}
            disableGlow={disableGlow}
            disableReflections={disableReflections}
          >
            {renderChild()}
          </ShaderCssGlow>
        </VariantCard> */}
      </div>
    </div>
  );
}
