import { useState } from 'react';
import { MetalFx, type MetalFxPreset, type MetalFxTheme } from '../src';

const presets: MetalFxPreset[] = ['chromatic', 'silver', 'gold'];

export function App() {
  const [theme, setTheme] = useState<MetalFxTheme>('dark');
  const isDark = theme === 'dark';

  return (
    <div
      style={{
        minHeight: '100vh',
        background: isDark ? '#0a0a0a' : '#fdfdfd',
        color: isDark ? '#d4d4d4' : '#1a1a22',
        fontFamily: "'Inter', system-ui, sans-serif",
        padding: 48,
        transition: 'background 0.2s, color 0.2s',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 48 }}>
        <h1 style={{ margin: 0, fontSize: 24, color: isDark ? '#fff' : '#111' }}>
          metal-fx playground
        </h1>
        <button
          onClick={() => setTheme(isDark ? 'light' : 'dark')}
          style={{
            padding: '6px 14px',
            borderRadius: 6,
            border: `1px solid ${isDark ? '#333' : '#ccc'}`,
            background: isDark ? '#1e1e1e' : '#f0f0f0',
            color: isDark ? '#eee' : '#111',
            cursor: 'pointer',
            fontSize: 13,
            fontWeight: 500,
          }}
        >
          {isDark ? '☀ Light' : '● Dark'}
        </button>
      </div>

      <section style={{ marginBottom: 48 }}>
        <h2 style={{ fontSize: 16, marginBottom: 16, color: isDark ? '#fff' : '#111' }}>
          Pill buttons — all presets
        </h2>
        <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap' }}>
          {presets.map((preset) => (
            <MetalFx key={preset} preset={preset} theme={theme}>
              <button
                style={{
                  padding: '10px 24px',
                  borderRadius: 20,
                  border: 'none',
                  background: isDark ? '#1d1d1d' : '#fff',
                  color: isDark ? '#f8f8f8' : '#121212',
                  fontSize: 14,
                  fontWeight: 500,
                  cursor: 'pointer',
                }}
              >
                {preset}
              </button>
            </MetalFx>
          ))}
        </div>
      </section>

      <section style={{ marginBottom: 48 }}>
        <h2 style={{ fontSize: 16, marginBottom: 16, color: isDark ? '#fff' : '#111' }}>
          Circle variant
        </h2>
        <div style={{ display: 'flex', gap: 24, alignItems: 'center' }}>
          {presets.map((preset) => (
            <MetalFx key={preset} preset={preset} variant="circle" theme={theme}>
              <button
                style={{
                  width: 40,
                  height: 40,
                  borderRadius: '50%',
                  border: 'none',
                  background: isDark ? '#1d1d1d' : '#fff',
                  color: isDark ? '#f8f8f8' : '#121212',
                  fontSize: 16,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                ★
              </button>
            </MetalFx>
          ))}
        </div>
      </section>

      <section>
        <h2 style={{ fontSize: 16, marginBottom: 16, color: isDark ? '#fff' : '#111' }}>
          Larger buttons
        </h2>
        <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap' }}>
          <MetalFx preset="chromatic" theme={theme}>
            <button
              style={{
                padding: '14px 32px',
                borderRadius: 12,
                border: 'none',
                background: isDark ? '#1d1d1d' : '#fff',
                color: isDark ? '#f8f8f8' : '#121212',
                fontSize: 16,
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              Upgrade to Pro
            </button>
          </MetalFx>
          <MetalFx preset="gold" theme={theme}>
            <button
              style={{
                padding: '14px 32px',
                borderRadius: 12,
                border: 'none',
                background: isDark ? '#1d1d1d' : '#fff',
                color: isDark ? '#f8f8f8' : '#121212',
                fontSize: 16,
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              Subscribe
            </button>
          </MetalFx>
        </div>
      </section>
    </div>
  );
}
