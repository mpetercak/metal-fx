import React, { type CSSProperties, type ReactNode, useEffect, useId, useMemo, useRef, useState } from "react";
import {
  buildStops,
  GLOW_ANGLES,
  GLOW_GA_DURATION,
  GLOW_GB_DURATION,
  getBaseKey,
  PALETTE,
  type Preset,
  RING_STEPS,
  SPIN_A_DURATION,
  SPIN_B_DURATION,
  type Theme,
  usePureCssStyles
} from "./pureCssStyles";

export type { Preset, Theme };

const RING_BASE: CSSProperties = {
  position: "absolute",
  inset: 0,
  borderRadius: "inherit",
  padding: 1,
  WebkitMask: "linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0)",
  WebkitMaskComposite: "xor",
  maskComposite: "exclude",
  pointerEvents: "none",
  zIndex: 3,
  willChange: "background"
};

function useVisibilityPause(ref: React.RefObject<HTMLElement | null>): boolean {
  const [visible, setVisible] = useState(true);
  // biome-ignore lint/correctness/useExhaustiveDependencies: ref is stable, .current read is intentional
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const obs = new IntersectionObserver(([entry]) => setVisible(entry.isIntersecting), { threshold: 0 });
    obs.observe(el);
    return () => obs.disconnect();
  }, []);
  return visible;
}

interface Props {
  children: ReactNode;
  preset?: Preset;
  theme?: Theme;
  variant?: "button" | "circle";
  strength?: number;
  disableGlow?: boolean;
  disableReflections?: boolean;
  id?: string;
}

export function PureCss({
  children,
  preset = "chromatic",
  theme = "dark",
  variant = "button",
  strength = 1,
  disableGlow = false,
  disableReflections = false,
  id
}: Props) {
  const instanceUid = useId().replace(/:/g, "");
  const uid = id || instanceUid;
  const rootRef = useRef<HTMLDivElement>(null);
  const [radius, setRadius] = useState(20);
  const [elSize, setElSize] = useState<[number, number]>([140, 40]);
  const colors = PALETTE[preset][theme];
  const isDark = theme === "dark";
  const isCircle = variant === "circle";
  const bg = isDark ? "#272727" : "#ffffff";
  const accentColor = colors[0];
  const isVisible = useVisibilityPause(rootRef);
  const styleKey = usePureCssStyles(preset, theme, strength);
  const baseKey = getBaseKey(preset, theme);
  const playState = isVisible ? "running" : "paused";

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const measure = () => {
      setElSize([root.offsetWidth, root.offsetHeight]);
      const childEl = root.querySelector("[data-mfx-content] > * > *") as HTMLElement | null;
      if (childEl) {
        const parsed = parseFloat(getComputedStyle(childEl).borderTopLeftRadius);
        if (Number.isFinite(parsed) && parsed > 0) {
          setRadius(isCircle ? Math.max(parsed, childEl.offsetWidth / 2) : parsed);
          return;
        }
      }
      if (isCircle) {
        setRadius(Math.min(root.offsetWidth, root.offsetHeight) / 2);
      }
    };
    measure();
    const obs = new ResizeObserver(measure);
    obs.observe(root);
    return () => obs.disconnect();
  }, [isCircle]);

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
      const a = ((((aDeg % 360) + 360) % 360) * Math.PI) / 180;
      if (d <= 0) return (a / (2 * Math.PI)) * perim;
      const critB = Math.PI - critA;
      if (a <= critA || a > 2 * Math.PI - critA) {
        return d + r * Math.tan(a > Math.PI ? a - 2 * Math.PI : a);
      }
      if (a <= critB) {
        const phi = a - Math.asin((d * Math.cos(a)) / r);
        return T + r * phi;
      }
      if (a <= Math.PI + critA) {
        return T + Math.PI * r + (d + r * Math.tan(a));
      }
      const aS = a - Math.PI;
      const phi = aS - Math.asin((d * Math.cos(aS)) / r);
      return 2 * T + Math.PI * r + r * phi;
    }

    return GLOW_ANGLES.map((ga) => {
      const conicAngle = ga + peakPct * 3.6;
      const dist = angleToPerim(conicAngle);
      return Math.round(((dist / perim) * 100 + 100) % 100);
    });
  }, [colors, radius, elSize]);

  const half = Math.ceil(colors.length / 2);
  const colorsA = colors.slice(0, half);
  const colorsB = colors.slice(half);
  // biome-ignore lint/correctness/useExhaustiveDependencies: colorsA/B are derived from colors (stable PALETTE ref)
  const stopsA = useMemo(() => buildStops(colorsA), [colors]);
  // biome-ignore lint/correctness/useExhaustiveDependencies: colorsA/B are derived from colors (stable PALETTE ref)
  const stopsB = useMemo(() => buildStops(colorsB), [colors]);

  const ringStyleA = useMemo<CSSProperties>(
    () => ({
      ...RING_BASE,
      background: `conic-gradient(from var(--mfx-a-${baseKey}), ${stopsA})`,
      opacity: strength * 0.85,
      animation: `mfx-spin-a-${baseKey} ${SPIN_A_DURATION}s steps(${RING_STEPS}, end) infinite`,
      animationPlayState: playState
    }),
    [baseKey, stopsA, strength, playState]
  );

  const ringStyleB = useMemo<CSSProperties>(
    () => ({
      ...RING_BASE,
      background: `conic-gradient(from var(--mfx-b-${baseKey}), ${stopsB})`,
      opacity: strength * 0.65,
      animation: `mfx-spin-b-${baseKey} ${SPIN_B_DURATION}s steps(${RING_STEPS}, end) infinite reverse`,
      animationPlayState: playState
    }),
    [baseKey, stopsB, strength, playState]
  );

  const glowStyle = useMemo<CSSProperties>(() => {
    if (disableGlow) return { display: "none" };
    return {
      position: "absolute",
      width: 32,
      height: 32,
      borderRadius: "50%",
      background: `radial-gradient(circle, color-mix(in srgb, var(--mfx-ga-${baseKey}) 60%, var(--mfx-gb-${baseKey})) 0%, transparent 70%)`,
      filter: "blur(8px)",
      pointerEvents: "none",
      zIndex: 1,
      offsetPath: `rect(0 100% 100% 0 round ${radius}px)`,
      willChange: "offset-distance, opacity",
      animation: [
        `mfx-glow-pos-${uid} ${SPIN_A_DURATION}s step-end infinite`,
        `mfx-glow-fade-${styleKey} ${SPIN_A_DURATION}s ease-in-out infinite`,
        `mfx-glow-ga-${baseKey} ${GLOW_GA_DURATION}s ease-in-out infinite`,
        `mfx-glow-gb-${baseKey} ${GLOW_GB_DURATION}s ease-in-out infinite reverse`
      ].join(","),
      animationPlayState: playState
    };
  }, [uid, baseKey, styleKey, disableGlow, radius, playState]);

  const reflectionStyle = useMemo<CSSProperties>(() => {
    if (disableReflections) return { display: "none" };
    const shadowColor = isDark ? accentColor : `${accentColor}66`;
    return {
      position: "absolute",
      inset: 0,
      borderRadius: "inherit",
      boxShadow: `-20px 0 20px -8px ${shadowColor}33, 20px 0 20px -8px ${shadowColor}33`,
      opacity: strength * 0.4,
      pointerEvents: "none",
      zIndex: -1
    };
  }, [accentColor, isDark, strength, disableReflections]);

  const rootStyle = useMemo<CSSProperties>(
    () => ({
      position: "relative",
      display: "inline-flex",
      alignItems: "center",
      justifyContent: "center",
      background: bg,
      borderRadius: radius,
      isolation: "isolate",
      overflow: "visible",
      contain: "layout style"
    }),
    [bg, radius]
  );

  const glowPosKeyframes = disableGlow
    ? ""
    : `
@keyframes mfx-glow-pos-${uid}{
  0%,24%{offset-distance:${glowSpots[0]}%}
  25%,49%{offset-distance:${glowSpots[1]}%}
  50%,74%{offset-distance:${glowSpots[2]}%}
  75%,99%{offset-distance:${glowSpots[3]}%}
  100%{offset-distance:${glowSpots[0]}%}
}`;

  return (
    <React.Fragment key={uid}>
      {glowPosKeyframes && <style>{glowPosKeyframes}</style>}
      <div ref={rootRef} style={rootStyle}>
        <div style={ringStyleA} aria-hidden="true" />
        <div style={ringStyleB} aria-hidden="true" />
        <div style={glowStyle} aria-hidden="true" />
        <div style={reflectionStyle} aria-hidden="true" />
        <div
          data-mfx-content=""
          style={{
            position: "relative",
            zIndex: 2,
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            width: "100%",
            background: bg,
            borderRadius: "inherit",
            pointerEvents: "none"
          }}
        >
          <div className="mfx-normalize" style={{ pointerEvents: "auto" }}>
            {children}
          </div>
        </div>
      </div>
    </React.Fragment>
  );
}
