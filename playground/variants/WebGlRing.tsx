import React, { type CSSProperties, type ReactNode, useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from "react";
import {
  GLOW_ANGLES,
  GLOW_GA_DURATION,
  GLOW_GB_DURATION,
  getBaseKey,
  PALETTE,
  type Preset,
  SPIN_A_DURATION,
  type Theme,
  usePureCssStyles
} from "./pureCssStyles";
import {
  createRingInstance,
  destroyRingInstance,
  updateRingInstance,
  setRingInstanceVisible,
  type RingInstance
} from "../engine/ring-renderer";

export type { Preset, Theme };

function hexToRgb(hex: string): [number, number, number] {
  const v = parseInt(hex.slice(1), 16);
  return [(v >> 16) / 255, ((v >> 8) & 0xff) / 255, (v & 0xff) / 255];
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

export function WebGlRing({
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
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const instanceRef = useRef<RingInstance | null>(null);
  const [radius, setRadius] = useState(20);
  const [elSize, setElSize] = useState<[number, number]>([140, 40]);
  const colors = PALETTE[preset][theme];
  const isDark = theme === "dark";
  const isCircle = variant === "circle";
  const bg = isDark ? "#272727" : "#ffffff";
  const accentColor = colors[0];

  const styleKey = usePureCssStyles(preset, theme, strength);
  const baseKey = getBaseKey(preset, theme);

  const half = Math.ceil(colors.length / 2);
  const colorsA: [[number, number, number], [number, number, number]] = [hexToRgb(colors[0]), hexToRgb(colors[1])];
  const colorsB: [[number, number, number], [number, number, number]] = [hexToRgb(colors[half]), hexToRgb(colors[half + 1])];

  useLayoutEffect(() => {
    const canvas = canvasRef.current;
    const root = rootRef.current;
    if (!canvas || !root) return;

    const rect = root.getBoundingClientRect();
    const cssWidth = Math.max(1, Math.round(rect.width));
    const cssHeight = Math.max(1, Math.round(rect.height));
    let cornerRadius = 20;

    const childEl = root.querySelector("[data-mfx-content] > * > *") as HTMLElement | null;
    if (childEl) {
      const parsed = parseFloat(getComputedStyle(childEl).borderTopLeftRadius);
      if (Number.isFinite(parsed) && parsed > 0) cornerRadius = parsed;
    }
    if (isCircle) cornerRadius = Math.max(cornerRadius, Math.min(cssWidth, cssHeight) / 2);

    const inst = createRingInstance({
      hostCanvas: canvas,
      cssWidth,
      cssHeight,
      cornerRadius,
      colorsA,
      colorsB,
      opacityA: strength * 0.85,
      opacityB: strength * 0.65,
    });
    instanceRef.current = inst;
    setRadius(cornerRadius);
    setElSize([cssWidth, cssHeight]);

    const ro = new ResizeObserver(() => {
      const r = root.getBoundingClientRect();
      const w = Math.max(1, Math.round(r.width));
      const h = Math.max(1, Math.round(r.height));
      let cr = cornerRadius;
      const resizedChild = root.querySelector("[data-mfx-content] > * > *") as HTMLElement | null;
      if (resizedChild) {
        const p = parseFloat(getComputedStyle(resizedChild).borderTopLeftRadius);
        if (Number.isFinite(p) && p > 0) cr = p;
      }
      if (isCircle) cr = Math.max(cr, Math.min(w, h) / 2);
      updateRingInstance(inst, { cssWidth: w, cssHeight: h, cornerRadius: cr });
      setRadius(cr);
      setElSize([w, h]);
    });
    ro.observe(root);

    let io: IntersectionObserver | null = null;
    if (typeof IntersectionObserver !== "undefined") {
      io = new IntersectionObserver(
        (entries) => { for (const e of entries) setRingInstanceVisible(inst, e.isIntersecting); },
        { threshold: 0 },
      );
      io.observe(root);
    }

    return () => {
      ro.disconnect();
      io?.disconnect();
      destroyRingInstance(inst);
      instanceRef.current = null;
    };
  }, [isCircle]);

  useEffect(() => {
    const inst = instanceRef.current;
    if (!inst) return;
    updateRingInstance(inst, {
      colorsA,
      colorsB,
      opacityA: strength * 0.85,
      opacityB: strength * 0.65,
    });
  }, [preset, theme, strength]);

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

  const isVisible = instanceRef.current?.visible ?? true;
  const playState = isVisible ? "running" : "paused";

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
        <canvas
          ref={canvasRef}
          aria-hidden="true"
          style={{
            position: "absolute",
            inset: 0,
            width: "100%",
            height: "100%",
            borderRadius: "inherit",
            pointerEvents: "none",
            zIndex: 3,
          }}
        />
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
