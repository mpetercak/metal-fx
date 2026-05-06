import { type CSSProperties, type ReactNode, useId, useLayoutEffect, useMemo, useRef, useState } from 'react';

type Preset = 'chromatic' | 'silver' | 'gold';
type Theme = 'dark' | 'light';

const PALETTE: Record<Preset, Record<Theme, string[]>> = {
  chromatic: {
    dark: ['#aae8ff', '#c5fe9e', '#f7888d', '#fffdc3'],
    light: ['#f0a0a0', '#c8d888', '#70c090', '#90a8e0'],
  },
  silver: {
    dark: ['#dedede', '#747270', '#e5e5e5', '#ffffff'],
    light: ['#b0b0b0', '#d0d0d0', '#a0a0a0', '#c8c8c8'],
  },
  gold: {
    dark: ['#ffffff', '#f7d488', '#fffdc3', '#ffffff'],
    light: ['#d4b060', '#c8a848', '#e0c878', '#b89840'],
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

  const half = Math.ceil(colors.length / 2);
  const colorsA = colors.slice(0, half);
  const colorsB = colors.slice(half);

  const buildStops = (cols: string[]) => {
    const s: string[] = [];
    const n = cols.length;
    const span = 100 / n;
    for (let i = 0; i < n; i++) {
      const start = span * i;
      s.push(`transparent ${start}%`);
      s.push(`${cols[i]}66 ${start + span * 0.42}%`);
      s.push(`${cols[i]} ${start + span * 0.47}%`);
      s.push(`${cols[i]}66 ${start + span * 0.52}%`);
      s.push(`transparent ${start + span * 0.58}%`);
    }
    return s.join(', ');
  };
  const stopsA = buildStops(colorsA);
  const stopsB = buildStops(colorsB);

  const ringBaseStyle: CSSProperties = {
    position: 'absolute',
    inset: 0,
    borderRadius: 'inherit',
    padding: ringPx,
    WebkitMask: 'linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0)',
    WebkitMaskComposite: 'xor',
    maskComposite: 'exclude',
    pointerEvents: 'none',
    zIndex: 0,
  };

  const ringStyleA = useMemo<CSSProperties>(() => ({
    ...ringBaseStyle,
    background: `conic-gradient(from var(--mfx-a-${uid}), ${stopsA})`,
    opacity: strength * 0.85,
    animation: `mfx-spin-a-${uid} 12s ease-in-out infinite`,
  }), [uid, stopsA, ringPx, strength]);

  const ringStyleB = useMemo<CSSProperties>(() => ({
    ...ringBaseStyle,
    background: `conic-gradient(from var(--mfx-b-${uid}), ${stopsB})`,
    opacity: strength * 0.65,
    animation: `mfx-spin-b-${uid} 8s ease-in-out infinite reverse`,
  }), [uid, stopsB, ringPx, strength]);

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
      offsetDistance: '15%',
      animation: `mfx-glow-fade-${uid} 4s ease-in-out infinite`,
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
        @property --mfx-a-${uid} {
          syntax: '<angle>';
          initial-value: 0deg;
          inherits: false;
        }
        @property --mfx-b-${uid} {
          syntax: '<angle>';
          initial-value: 0deg;
          inherits: false;
        }
        @keyframes mfx-spin-a-${uid} {
          0%   { --mfx-a-${uid}: 0deg; }
          25%  { --mfx-a-${uid}: 140deg; }
          50%  { --mfx-a-${uid}: 200deg; }
          75%  { --mfx-a-${uid}: 290deg; }
          100% { --mfx-a-${uid}: 360deg; }
        }
        @keyframes mfx-spin-b-${uid} {
          0%   { --mfx-b-${uid}: 0deg; }
          30%  { --mfx-b-${uid}: 120deg; }
          60%  { --mfx-b-${uid}: 250deg; }
          100% { --mfx-b-${uid}: 360deg; }
        }
        @keyframes mfx-glow-fade-${uid} {
          0%, 100% { opacity: 0; }
          30%, 70%  { opacity: ${strength * 0.25}; }
        }
      `}</style>
      <div ref={rootRef} style={rootStyle}>
        <div style={ringStyleA} aria-hidden="true" />
        <div style={ringStyleB} aria-hidden="true" />
        <div style={glowStyle} aria-hidden="true" />
        <div style={reflectionStyle} aria-hidden="true" />
        <div data-mfx-content="" style={{ position: 'relative', zIndex: 2, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: '100%', pointerEvents: 'none' }}>
          <div className="mfx-normalize" style={{ pointerEvents: 'auto' }}>{children}</div>
        </div>
      </div>
    </>
  );
}
