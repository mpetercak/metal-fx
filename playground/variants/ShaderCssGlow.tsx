import { type CSSProperties, type ReactNode, useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'react';
import {
  createInstance,
  destroyInstance,
  setInstanceVisible,
  setSharedPreset,
  updateInstance,
  type LiteInstance,
} from '../engine/lite-renderer';
import type { PresetName, PresetTheme } from '../../src/engine/presets';

const ACCENT: Record<PresetName, Record<PresetTheme, string>> = {
  chromatic: { dark: '#aae8ff', light: '#b0e9bc' },
  silver: { dark: '#dedede', light: '#c9c9c9' },
  gold: { dark: '#f7d488', light: '#dcd2bc' },
};

interface Props {
  children: ReactNode;
  preset?: PresetName;
  theme?: PresetTheme;
  variant?: 'button' | 'circle';
  strength?: number;
  disableGlow?: boolean;
  disableReflections?: boolean;
}

export function ShaderCssGlow({
  children,
  preset = 'chromatic',
  theme = 'dark',
  variant = 'button',
  strength = 1,
  disableGlow = false,
  disableReflections = false,
}: Props) {
  const uid = useId().replace(/:/g, '');
  const rootRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const instanceRef = useRef<LiteInstance | null>(null);
  const shape = variant === 'circle' ? 'circle' as const : 'pill' as const;
  const isDark = theme === 'dark';
  const accent = ACCENT[preset][theme];
  const [radius, setRadius] = useState(20);

  useEffect(() => { setSharedPreset(preset, theme); }, [preset, theme]);

  useLayoutEffect(() => {
    const canvas = canvasRef.current;
    const root = rootRef.current;
    if (!canvas || !root) return;

    const rect = root.getBoundingClientRect();
    const cssWidth = Math.max(1, Math.round(rect.width));
    const cssHeight = Math.max(1, Math.round(rect.height));
    const childEl = root.querySelector('[data-mfx-content] > * > *') as HTMLElement | null;
    let cornerRadius = 0;
    if (childEl) {
      const parsed = parseFloat(getComputedStyle(childEl).borderTopLeftRadius);
      if (Number.isFinite(parsed) && parsed > 0) cornerRadius = parsed;
    }
    if (shape === 'circle') cornerRadius = Math.max(cornerRadius, Math.min(cssWidth, cssHeight) / 2);

    const inst = createInstance({
      hostCanvas: canvas,
      cssWidth,
      cssHeight,
      cornerRadius,
      kind: shape,
      ringCssPx: shape === 'circle' ? 1 : 1,
    });
    instanceRef.current = inst;
    root.style.borderRadius = `${cornerRadius}px`;
    setRadius(cornerRadius);

    const ro = new ResizeObserver(() => {
      const r = root.getBoundingClientRect();
      const w = Math.max(1, Math.round(r.width));
      const h = Math.max(1, Math.round(r.height));
      let cr = cornerRadius;
      const resizedChild = root.querySelector('[data-mfx-content] > * > *') as HTMLElement | null;
      if (resizedChild) {
        const p = parseFloat(getComputedStyle(resizedChild).borderTopLeftRadius);
        if (Number.isFinite(p) && p > 0) cr = p;
      }
      if (shape === 'circle') cr = Math.max(cr, Math.min(w, h) / 2);
      updateInstance(inst, { cssWidth: w, cssHeight: h, cornerRadius: cr });
      root.style.borderRadius = `${cr}px`;
      setRadius(cr);
    });
    ro.observe(root);

    let io: IntersectionObserver | null = null;
    if (typeof IntersectionObserver !== 'undefined') {
      io = new IntersectionObserver(
        (entries) => { for (const e of entries) setInstanceVisible(inst, e.isIntersecting); },
        { rootMargin: '64px' },
      );
      io.observe(root);
    }

    return () => {
      ro.disconnect();
      io?.disconnect();
      destroyInstance(inst);
      instanceRef.current = null;
    };
  }, [shape]);

  useEffect(() => {
    const inst = instanceRef.current;
    if (!inst) return;
    const cap = variant === 'button' ? 0.92 : 1;
    updateInstance(inst, { opacityMul: Math.max(0, Math.min(1, strength * cap)) });
  }, [strength, variant]);

  const bg = isDark ? '#272727' : '#ffffff';

  const glowStyle = useMemo<CSSProperties>(() => {
    if (disableGlow) return { display: 'none' };
    return {
      position: 'absolute',
      width: 20,
      height: 20,
      borderRadius: '50%',
      background: `radial-gradient(circle, ${accent} 0%, transparent 70%)`,
      filter: 'blur(8px)',
      opacity: strength * 0.3,
      pointerEvents: 'none',
      zIndex: 3,
      offsetPath: `rect(0 100% 100% 0 round ${radius}px)`,
      animation: `mfx-l3-glow-${uid} 12s ease-in-out infinite alternate`,
    };
  }, [uid, accent, strength, disableGlow, radius]);

  const reflectionBase = useMemo<CSSProperties>(() => {
    if (disableReflections) return { display: 'none' };
    return {
      position: 'absolute' as const,
      top: '25%',
      bottom: '25%',
      width: 12,
      borderRadius: '50%',
      background: `radial-gradient(circle, ${isDark ? accent : `${accent}88`}, transparent)`,
      filter: 'blur(10px)',
      opacity: strength * 0.45,
      pointerEvents: 'none' as const,
      zIndex: -1,
    };
  }, [accent, isDark, disableReflections, strength]);

  return (
    <>
      <style>{`
        @keyframes mfx-l3-glow-${uid} {
          0%   { offset-distance: 0%; }
          100% { offset-distance: 100%; }
        }
      `}</style>
      <div
        ref={rootRef}
        style={{
          position: 'relative',
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          isolation: 'isolate',
          overflow: 'visible',
          background: bg,
          color: isDark ? '#f8f8f8' : '#1d1d1d',
        }}
      >
        {/* biome-ignore lint/a11y/noAriaHiddenOnFocusable: decorative canvas */}
        <canvas
          ref={canvasRef}
          aria-hidden="true"
          tabIndex={-1}
          style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', borderRadius: 'inherit', zIndex: 0, pointerEvents: 'none' }}
        />
        <div style={glowStyle} aria-hidden="true" />
        <div style={{ ...reflectionBase, left: -14 }} aria-hidden="true" />
        <div style={{ ...reflectionBase, right: -14 }} aria-hidden="true" />
        <div
          aria-hidden="true"
          style={{
            position: 'absolute',
            inset: 0,
            borderRadius: 'inherit',
            pointerEvents: 'none',
            zIndex: 4,
            boxShadow: `inset 0 0 0 1px ${isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.06)'}`,
          }}
        />
        <div data-mfx-content="" style={{ position: 'relative', zIndex: 5, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: '100%', pointerEvents: 'none' }}>
          <div className="mfx-normalize" style={{ pointerEvents: 'auto' }}>{children}</div>
        </div>
      </div>
    </>
  );
}
