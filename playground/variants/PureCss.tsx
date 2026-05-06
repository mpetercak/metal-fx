import { type CSSProperties, type ReactNode, useId, useLayoutEffect, useMemo, useRef, useState } from 'react';

type Preset = 'chromatic' | 'silver' | 'gold';
type Theme = 'dark' | 'light';

const PALETTE: Record<Preset, Record<Theme, string[]>> = {
  chromatic: {
    dark: ['#aae8ff', '#c5fe9e', '#f7888d', '#fffdc3', '#007cff'],
    light: ['#fff2f2', '#fffad2', '#b0e9bc', '#e1ecff', '#9ea0a7'],
  },
  silver: {
    dark: ['#dedede', '#747270', '#e5e5e5', '#ffffff', '#e6e6e6'],
    light: ['#f6f6f6', '#ffffff', '#f7f7f7', '#c9c9c9', '#d0d0d0'],
  },
  gold: {
    dark: ['#ffffff', '#f7d488', '#fffdc3', '#ffffff', '#f7d488'],
    light: ['#fff8e1', '#fffbe0', '#fff6d6', '#dcd2bc', '#f9f7e5'],
  },
};

interface Props {
  children: ReactNode;
  preset?: Preset;
  theme?: Theme;
  variant?: 'button' | 'circle';
  strength?: number;
  disableGlow?: boolean;
  disableReflections?: boolean;
}

export function PureCss({
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
  const [radius, setRadius] = useState(20);
  const colors = PALETTE[preset][theme];
  const isDark = theme === 'dark';
  const isCircle = variant === 'circle';
  const bg = isDark ? '#272727' : '#ffffff';
  const ringPx = isCircle ? 1 : 1;
  const accentColor = colors[0];

  useLayoutEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const childEl = root.querySelector('[data-mfx-content] > * > *') as HTMLElement | null;
    if (childEl) {
      const parsed = parseFloat(getComputedStyle(childEl).borderTopLeftRadius);
      if (Number.isFinite(parsed) && parsed > 0) {
        setRadius(isCircle ? Math.max(parsed, childEl.offsetWidth / 2) : parsed);
        return;
      }
    }
    if (isCircle) {
      const rect = root.getBoundingClientRect();
      setRadius(Math.min(rect.width, rect.height) / 2);
    }
  }, [variant, isCircle]);

  const rootStyle = useMemo<CSSProperties>(() => ({
    position: 'relative',
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: bg,
    borderRadius: radius,
    isolation: 'isolate',
    overflow: 'visible',
  }), [bg, radius]);

  const gradientStops = colors.map((c, i) => `${c} ${(i / colors.length) * 100}%`).join(', ') + `, ${colors[0]} 100%`;

  const ringStyle = useMemo<CSSProperties>(() => ({
    content: '""',
    position: 'absolute',
    inset: 0,
    borderRadius: 'inherit',
    padding: ringPx,
    background: `conic-gradient(from var(--mfx-css-angle-${uid}), ${gradientStops})`,
    WebkitMask: 'linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0)',
    WebkitMaskComposite: 'xor',
    maskComposite: 'exclude',
    opacity: strength * 0.85,
    pointerEvents: 'none',
    zIndex: 0,
    animation: `mfx-css-spin-${uid} 4s linear infinite`,
  }), [uid, gradientStops, ringPx, strength]);

  const glowStyle = useMemo<CSSProperties>(() => {
    if (disableGlow) return { display: 'none' };
    return {
      position: 'absolute',
      width: 24,
      height: 24,
      borderRadius: '50%',
      background: `radial-gradient(circle, ${accentColor} 0%, transparent 70%)`,
      filter: 'blur(8px)',
      opacity: strength * 0.6,
      pointerEvents: 'none',
      zIndex: 1,
      offsetPath: `rect(0 100% 100% 0 round ${radius}px)`,
      animation: `mfx-css-glow-${uid} 6s ease-in-out infinite alternate`,
    };
  }, [uid, accentColor, strength, disableGlow, radius]);

  const reflectionStyle = useMemo<CSSProperties>(() => {
    if (disableReflections) return { display: 'none' };
    const shadowColor = isDark ? accentColor : `${accentColor}66`;
    return {
      position: 'absolute',
      inset: 0,
      borderRadius: 'inherit',
      boxShadow: `
        -20px 0 20px -8px ${shadowColor}33,
         20px 0 20px -8px ${shadowColor}33
      `,
      opacity: strength * 0.4,
      pointerEvents: 'none',
      zIndex: -1,
    };
  }, [accentColor, isDark, strength, disableReflections]);

  return (
    <>
      <style>{`
        @property --mfx-css-angle-${uid} {
          syntax: '<angle>';
          initial-value: 0deg;
          inherits: false;
        }
        @keyframes mfx-css-spin-${uid} {
          to { --mfx-css-angle-${uid}: 360deg; }
        }
        @keyframes mfx-css-glow-${uid} {
          0%   { offset-distance: 0%; }
          100% { offset-distance: 100%; }
        }
      `}</style>
      <div ref={rootRef} style={rootStyle}>
        <div style={ringStyle} aria-hidden="true" />
        <div style={glowStyle} aria-hidden="true" />
        <div style={reflectionStyle} aria-hidden="true" />
        <div data-mfx-content="" style={{ position: 'relative', zIndex: 2, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: '100%', pointerEvents: 'none' }}>
          <div className="mfx-normalize" style={{ pointerEvents: 'auto' }}>{children}</div>
        </div>
      </div>
    </>
  );
}
