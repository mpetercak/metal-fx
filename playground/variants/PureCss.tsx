import React from 'react';
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
  const [elSize, setElSize] = useState<[number, number]>([140, 40]);
  const colors = PALETTE[preset][theme];
  const isDark = theme === 'dark';
  const isCircle = variant === 'circle';
  const bg = isDark ? '#272727' : '#ffffff';
  const ringPx = isCircle ? 1 : 1;
  const accentColor = colors[0];

  useLayoutEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    setElSize([root.offsetWidth, root.offsetHeight]);
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

  // Ring A dwells at these 4 angles (in order). At each angle, colour 0's peak
  // lands at a specific perimeter position — that's where the glow appears.
  // The mapping from conic-gradient angle → offset-path % is NON-LINEAR for pills
  // because long flat edges span a small angular range from center.
  const glowAngles = [0, 140, 200, 290];
  const glowSpots = useMemo(() => {
    const n = Math.ceil(colors.length / 2);
    const peakPct = 47 / n;
    const [w, h] = elSize;
    const r = Math.min(radius, w / 2, h / 2);
    const T = Math.max(0, w - 2 * r);
    const perim = 2 * T + 2 * Math.PI * r;
    if (perim === 0) return [0, 25, 50, 75];
    const d = w / 2 - r;
    const critA = d > 0 ? Math.atan2(d, r) : 0;

    function angleToPerim(aDeg: number): number {
      const a = (((aDeg % 360) + 360) % 360) * Math.PI / 180;
      if (d <= 0) return a / (2 * Math.PI) * perim;
      const critB = Math.PI - critA;
      if (a <= critA || a > 2 * Math.PI - critA) {
        return d + r * Math.tan(a > Math.PI ? a - 2 * Math.PI : a);
      }
      if (a <= critB) {
        const phi = a - Math.asin(d * Math.cos(a) / r);
        return T + r * phi;
      }
      if (a <= Math.PI + critA) {
        return T + Math.PI * r + (d + r * Math.tan(a));
      }
      const aS = (a - Math.PI);
      const phi = aS - Math.asin(d * Math.cos(aS) / r);
      return 2 * T + Math.PI * r + r * phi;
    }

    return glowAngles.map(ga => {
      const conicAngle = ga + peakPct * 3.6;
      const dist = angleToPerim(conicAngle);
      return Math.round(((dist / perim) * 100 + 100) % 100);
    });
  }, [colors, radius, elSize]);

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
      s.push(`${cols[i]}55 ${start + span * 0.43}%`);
      s.push(`${cols[i]} ${start + span * 0.47}%`);
      s.push(`${cols[i]}55 ${start + span * 0.51}%`);
      s.push(`transparent ${start + span * 0.56}%`);
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
    zIndex: 3,
  };

  const ringStyleA = useMemo<CSSProperties>(() => ({
    ...ringBaseStyle,
    background: `conic-gradient(from var(--mfx-a-${uid}), ${stopsA})`,
    opacity: strength * 0.85,
    animation: `mfx-spin-a-${uid} 36s linear infinite`,
  }), [uid, stopsA, ringPx, strength]);

  const ringStyleB = useMemo<CSSProperties>(() => ({
    ...ringBaseStyle,
    background: `conic-gradient(from var(--mfx-b-${uid}), ${stopsB})`,
    opacity: strength * 0.65,
    animation: `mfx-spin-b-${uid} 14s ease-in-out infinite reverse`,
  }), [uid, stopsB, ringPx, strength]);

  // The glow is a blurred dot that sits on the border edge.
  // It uses CSS offset-path to position itself along the rounded-rect perimeter.
  // Four animations run in parallel:
  //   1. mfx-glow-pos  (36s) — WHERE on the border it sits (jumps between spots)
  //   2. mfx-glow-fade (36s) — visibility (fade in, dwell, fade out at each spot)
  //   3. mfx-glow-ga   (18s) — ring A colour at glow position (synced to ring A speed)
  //   4. mfx-glow-gb   (14s) — ring B colour at glow position (synced to ring B speed)
  //   color-mix() in the gradient blends ga + gb for the composite glow colour.
  const glowStyle = useMemo<CSSProperties>(() => {
    if (disableGlow) return { display: 'none' };
    return {
      position: 'absolute',
      width: 32,
      height: 32,
      borderRadius: '50%',
      background: `radial-gradient(circle, color-mix(in srgb, var(--mfx-ga-${uid}) 60%, var(--mfx-gb-${uid})) 0%, transparent 70%)`,
      filter: 'blur(8px)',
      pointerEvents: 'none',
      zIndex: 1,
      // offset-path makes the element follow the border shape (rect with rounded corners)
      offsetPath: `rect(0 100% 100% 0 round ${radius}px)`,
      // offset-distance (set by keyframes) controls where along that path it sits (0-100%)
      animation: `mfx-glow-pos-${uid} 36s linear infinite, mfx-glow-fade-${uid} 36s ease-in-out infinite, mfx-glow-ga-${uid} 18s ease-in-out infinite, mfx-glow-gb-${uid} 14s ease-in-out infinite reverse`,
    };
  }, [uid, colors, strength, disableGlow, radius]);

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
        /* ── @property declarations ──
           These tell the browser HOW to interpolate custom properties.
           Without @property, CSS variables snap between values instantly.
           With it, the browser can smoothly tween angles, colours, etc. */

        /* Ring A rotation angle — used in conic-gradient(from var(--mfx-a-...)) */
        @property --mfx-a-${uid} {
          syntax: '<angle>';
          initial-value: 0deg;
          inherits: false;
        }
        /* Ring B rotation angle — same idea, different ring */
        @property --mfx-b-${uid} {
          syntax: '<angle>';
          initial-value: 0deg;
          inherits: false;
        }
        /* Glow colour properties — one per ring, animated at each ring's speed.
           color-mix() in the gradient blends them for the composite glow colour. */
        @property --mfx-ga-${uid} {
          syntax: '<color>';
          initial-value: ${colorsA[0]};
          inherits: false;
        }
        @property --mfx-gb-${uid} {
          syntax: '<color>';
          initial-value: ${colorsB[0]};
          inherits: false;
        }

        /* ── Ring A rotation keyframes ──
           Synced to 24s (same as glow). Holds angle during glow visibility windows
           so ring A's colour stays under the glow. Rotates during invisible gaps. */
        @keyframes mfx-spin-a-${uid} {
          0%   { --mfx-a-${uid}: ${glowAngles[0]}deg; }
          24%  { --mfx-a-${uid}: ${glowAngles[0]}deg; }
          29%  { --mfx-a-${uid}: ${glowAngles[1]}deg; }
          49%  { --mfx-a-${uid}: ${glowAngles[1]}deg; }
          54%  { --mfx-a-${uid}: ${glowAngles[2]}deg; }
          74%  { --mfx-a-${uid}: ${glowAngles[2]}deg; }
          79%  { --mfx-a-${uid}: ${glowAngles[3]}deg; }
          99%  { --mfx-a-${uid}: ${glowAngles[3]}deg; }
          100% { --mfx-a-${uid}: ${glowAngles[0] + 360}deg; }
        }
        @keyframes mfx-spin-b-${uid} {
          0%   { --mfx-b-${uid}: 0deg; }
          30%  { --mfx-b-${uid}: 120deg; }
          60%  { --mfx-b-${uid}: 250deg; }
          100% { --mfx-b-${uid}: 360deg; }
        }

        /* ── Glow position keyframes ──
           The 24s cycle is split into 4 segments (0-25%, 25-50%, 50-75%, 75-100%).
           Within each segment the position HOLDS CONSTANT.
           The jump to the next value happens in the gap — when opacity is 0.
           Positions are randomly selected bright spots from the ring's colour peaks. */
        @keyframes mfx-glow-pos-${uid} {
          0%, 23%    { offset-distance: ${glowSpots[0]}%; }
          25%, 48%   { offset-distance: ${glowSpots[1]}%; }
          50%, 73%   { offset-distance: ${glowSpots[2]}%; }
          75%, 98%   { offset-distance: ${glowSpots[3]}%; }
          100%       { offset-distance: ${glowSpots[0]}%; }
        }

        /* ── Glow opacity keyframes ──
           Each 25% segment: fade in (4%) → dwell visible (16%) → fade out (4%) → invisible gap (1%)
           The invisible gap (24-25%, 49-50%, etc.) is when position jumps happen.
           Pattern repeats 4 times across the full 24s cycle. */
        @keyframes mfx-glow-fade-${uid} {
          0%   { opacity: 0; }
          4%   { opacity: ${strength * 0.7}; }
          20%  { opacity: ${strength * 0.7}; }
          24%  { opacity: 0; }
          25%  { opacity: 0; }
          29%  { opacity: ${strength * 0.7}; }
          45%  { opacity: ${strength * 0.7}; }
          49%  { opacity: 0; }
          50%  { opacity: 0; }
          54%  { opacity: ${strength * 0.7}; }
          70%  { opacity: ${strength * 0.7}; }
          74%  { opacity: 0; }
          75%  { opacity: 0; }
          79%  { opacity: ${strength * 0.7}; }
          95%  { opacity: ${strength * 0.7}; }
          99%  { opacity: 0; }
          100% { opacity: 0; }
        }

        /* ── Glow colour keyframes ──
           Each ring's colours cycle at its own speed.
           The glow gradient uses color-mix() to blend them live. */
        @keyframes mfx-glow-ga-${uid} {
          ${colorsA.map((c, i) => {
            const seg = 100 / colorsA.length;
            const peak = Math.round(seg * i + seg * 0.47);
            const start = Math.round(seg * i + seg * 0.3);
            const end = Math.round(seg * i + seg * 0.65);
            return `${start}% { --mfx-ga-${uid}: transparent; }\n          ${peak}% { --mfx-ga-${uid}: ${c}; }\n          ${end}% { --mfx-ga-${uid}: transparent; }`;
          }).join('\n          ')}
        }
        @keyframes mfx-glow-gb-${uid} {
          ${colorsB.map((c, i) => {
            const seg = 100 / colorsB.length;
            const peak = Math.round(seg * i + seg * 0.47);
            const start = Math.round(seg * i + seg * 0.3);
            const end = Math.round(seg * i + seg * 0.65);
            return `${start}% { --mfx-gb-${uid}: transparent; }\n          ${peak}% { --mfx-gb-${uid}: ${c}; }\n          ${end}% { --mfx-gb-${uid}: transparent; }`;
          }).join('\n          ')}
        }
      `}</style>
      <div ref={rootRef} style={rootStyle}>
        <div style={ringStyleA} aria-hidden="true" />
        <div style={ringStyleB} aria-hidden="true" />
        <div style={glowStyle} aria-hidden="true" />
        <div style={reflectionStyle} aria-hidden="true" />
        <div data-mfx-content="" style={{ position: 'relative', zIndex: 2, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: '100%', background: bg, borderRadius: 'inherit', pointerEvents: 'none' }}>
          <div className="mfx-normalize" style={{ pointerEvents: 'auto' }}>{children}</div>
        </div>
      </div>
    </>
  );
}
