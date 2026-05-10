import React, { useState } from 'react';
import { MetalFx, type MetalFxPreset, type MetalFxVariant } from '../../src';
import type { Theme } from '../hooks/useTheme';
import { CopyButton } from './CopyButton';
import { ArrowUpIcon } from './icons';
import { PlayPauseToggle } from './PlayPauseToggle';
import { Button } from './ui/button';

const PRESETS: MetalFxPreset[] = ['chromatic', 'silver', 'gold'];
const VARIANTS: MetalFxVariant[] = ['button', 'circle'];

type PlaygroundTab = 'default' | 'shadcn';

function buildSnippet(variant: MetalFxVariant, preset: MetalFxPreset, strength: number) {
  const props = [`preset="${preset}"`];
  if (variant !== 'button') props.push(`variant="${variant}"`);
  if (strength !== 1) props.push(`strength={${strength.toFixed(2)}}`);
  const child = variant === 'circle'
    ? '  <button aria-label="Send"><ArrowUpIcon /></button>'
    : '  <button>Upgrade to Pro</button>';
  return `<MetalFx ${props.join(' ')}>\n${child}\n</MetalFx>`;
}

function buildShadcnSnippet(preset: MetalFxPreset, strength: number, btnVariant: string) {
  const props = [`preset="${preset}"`];
  if (strength !== 1) props.push(`strength={${strength.toFixed(2)}}`);
  return `<MetalFx ${props.join(' ')}>\n  <Button variant="${btnVariant}">Click me</Button>\n</MetalFx>`;
}

export function Playground({ theme, disableGlow }: { theme: Theme; disableGlow: boolean }) {
  const [tab, setTab] = useState<PlaygroundTab>('default');
  const [variant, setVariant] = useState<MetalFxVariant>('button');
  const [preset, setPreset] = useState<MetalFxPreset>('chromatic');
  const [strength, setStrength] = useState(100);
  const [paused, setPaused] = useState(false);

  const snippet = tab === 'default'
    ? buildSnippet(variant, preset, strength / 100)
    : buildShadcnSnippet(preset, strength / 100, 'default');

  return (
    <section className="playground-section" aria-label="Interactive playground">
      <h2 className="section-title">Playground</h2>

      <div className="playground-tabs">
        <button
          className={`tab-btn${tab === 'default' ? ' active' : ''}`}
          type="button"
          onClick={() => setTab('default')}
        >
          Default
        </button>
        <button
          className={`tab-btn${tab === 'shadcn' ? ' active' : ''}`}
          type="button"
          onClick={() => setTab('shadcn')}
        >
          Shadcn
        </button>
      </div>

      <div className="playground-controls">
        {tab === 'default' && (
          <div className="control-group" role="radiogroup" aria-label="Component type">
            <span className="control-label">Type</span>
            <div className="control-options">
              {VARIANTS.map((v) => (
                <button
                  key={v}
                  className={`tab-btn${variant === v ? ' active' : ''}`}
                  type="button"
                  onClick={() => setVariant(v)}
                >
                  {v.charAt(0).toUpperCase() + v.slice(1)}
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="control-group" role="radiogroup" aria-label="Color preset">
          <span className="control-label">Color</span>
          <div className="control-options">
            {PRESETS.map((p) => (
              <button
                key={p}
                className={`tab-btn${preset === p ? ' active' : ''}`}
                type="button"
                onClick={() => setPreset(p)}
              >
                {p.charAt(0).toUpperCase() + p.slice(1)}
              </button>
            ))}
          </div>
        </div>

        <div className="control-group control-group--strength">
          <span className="control-label">Strength</span>
          <div className="strength-track">
            <div className="strength-fill" style={{ width: `${strength}%` }} />
            <span className="strength-value">{strength}%</span>
            <input
              className="strength-input"
              type="range"
              min={0}
              max={100}
              step={1}
              value={strength}
              onChange={(e) => setStrength(Number(e.target.value))}
              aria-label="Effect strength"
            />
          </div>
        </div>

        <div className="control-group control-group--toggle">
          <label>
            <input type="checkbox" checked={paused} onChange={(e) => setPaused(e.target.checked)} />
            Paused
          </label>
        </div>
      </div>

      <div className="playground-preview">
        {tab === 'default' ? (
          <>
            <MetalFx
              key={`${variant}-${preset}`}
              preset={preset}
              variant={variant}
              theme={theme}
              strength={strength / 100}
              paused={paused}
              disableGlow={disableGlow}
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
          </>
        ) : (
          <div className="shadcn-grid">
            <MetalFx preset={preset} theme={theme} strength={strength / 100} paused={paused} disableGlow={disableGlow}>
              <Button variant="default">Default</Button>
            </MetalFx>
            <MetalFx preset={preset} theme={theme} strength={strength / 100} paused={paused} disableGlow={disableGlow}>
              <Button variant="secondary">Secondary</Button>
            </MetalFx>
            <MetalFx preset={preset} theme={theme} strength={strength / 100} paused={paused} disableGlow={disableGlow}>
              <Button variant="outline">Outline</Button>
            </MetalFx>
            <MetalFx preset={preset} theme={theme} strength={strength / 100} paused={paused} disableGlow={disableGlow}>
              <Button variant="ghost">Ghost</Button>
            </MetalFx>
          </div>
        )}

        <PlayPauseToggle playing={!paused} onToggle={() => setPaused((p) => !p)} />
      </div>

      <div className="code-block code-block--multi">
        <code>{snippet}</code>
        <CopyButton getText={() => snippet} />
      </div>
    </section>
  );
}
