import { type CSSProperties, type ReactNode, useMemo } from "react";
import { buildReflectionStops, getBaseKey, PALETTE, type Preset, RING_STEPS, SPIN_A_DURATION, SPIN_B_DURATION, type Theme } from "./pureCssStyles";

interface ReflectionProps {
  children: ReactNode;
  preset?: Preset;
  theme?: Theme;
  side?: "left" | "right";
  intensity?: number;
}

export function PureCssReflection({
  children,
  preset = "chromatic",
  theme = "dark",
  side = "left",
  intensity = 0.5
}: ReflectionProps) {
  const colors = PALETTE[preset][theme];
  const half = Math.ceil(colors.length / 2);
  const colorsA = colors.slice(0, half);
  const colorsB = colors.slice(half);
  const baseKey = getBaseKey(preset, theme);
  const stopsA = useMemo(() => buildReflectionStops(colorsA), [colorsA]);
  const stopsB = useMemo(() => buildReflectionStops(colorsB), [colorsB]);
  const fadeMaskDir = side === "left" ? "to right" : "to left";

  const ringAStyle: CSSProperties = useMemo(
    () => ({
      position: "absolute",
      inset: 1,
      borderRadius: "inherit",
      padding: 1,
      background: `conic-gradient(from calc(var(--mfx-a-${baseKey}) + 180deg), ${stopsA})`,
      animation: `mfx-spin-a-${baseKey} ${SPIN_A_DURATION}s steps(${RING_STEPS}, end) infinite`,
      WebkitMask: "linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0)",
      WebkitMaskComposite: "xor",
      maskComposite: "exclude",
      opacity: intensity * 0.85,
      pointerEvents: "none",
      filter: "blur(4px)",
      willChange: "background"
    }),
    [baseKey, stopsA, intensity]
  );

  const ringBStyle: CSSProperties = useMemo(
    () => ({
      position: "absolute",
      inset: 0,
      borderRadius: "inherit",
      padding: 1,
      background: `conic-gradient(from calc(var(--mfx-b-${baseKey}) + 180deg), ${stopsB})`,
      animation: `mfx-spin-b-${baseKey} ${SPIN_B_DURATION}s steps(${RING_STEPS}, end) infinite reverse`,
      WebkitMask: "linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0)",
      WebkitMaskComposite: "xor",
      maskComposite: "exclude",
      opacity: intensity * 0.65,
      pointerEvents: "none",
      willChange: "background"
    }),
    [baseKey, stopsB, intensity]
  );

  const fillStyle: CSSProperties = useMemo(
    () => ({
      position: "absolute",
      inset: 0,
      borderRadius: "inherit",
      background: `conic-gradient(from calc(var(--mfx-a-${baseKey}) + 180deg), ${stopsA})`,
      animation: `mfx-spin-a-${baseKey} ${SPIN_A_DURATION}s steps(${RING_STEPS}, end) infinite`,
      opacity: intensity * 0.1,
      pointerEvents: "none",
      filter: "blur(6px)",
      mixBlendMode: "screen"
    }),
    [baseKey, stopsA, intensity]
  );

  const reflectionWrapStyle: CSSProperties = useMemo(
    () => ({
      position: "absolute",
      inset: 0,
      borderRadius: "inherit",
      overflow: "hidden",
      pointerEvents: "none",
      WebkitMask: `linear-gradient(${fadeMaskDir}, white 0%, white 10%, transparent 35%)`,
      mask: `linear-gradient(${fadeMaskDir}, white 0%, white 10%, transparent 35%)`
    }),
    [fadeMaskDir]
  );

  return (
    <div
      style={{
        position: "relative",
        isolation: "isolate",
        display: "inline-flex",
        borderRadius: 9999,
        overflow: "hidden"
      }}
    >
      {children}
      <div style={reflectionWrapStyle} aria-hidden="true">
        <div style={fillStyle} />
        <div style={ringAStyle} />
        <div style={ringBStyle} />
      </div>
    </div>
  );
}
