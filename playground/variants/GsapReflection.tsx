import { type CSSProperties, type ReactNode, useEffect, useMemo, useRef } from "react";
import { gsap } from "gsap";
import {
  buildReflectionStops,
  PALETTE,
  type Preset,
  SPIN_A_DURATION,
  SPIN_B_DURATION,
  type Theme
} from "./pureCssStyles";

type Anim = ReturnType<typeof gsap.to>;

const RING_MASK: CSSProperties = {
  position: "absolute",
  borderRadius: "inherit",
  padding: 1,
  WebkitMask: "linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0)",
  WebkitMaskComposite: "xor",
  maskComposite: "exclude",
  pointerEvents: "none",
  willChange: "background"
};

interface ReflectionProps {
  children: ReactNode;
  preset?: Preset;
  theme?: Theme;
  side?: "left" | "right";
  intensity?: number;
}

export function GsapReflection({
  children,
  preset = "chromatic",
  theme = "dark",
  side = "left",
  intensity = 0.5
}: ReflectionProps) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const ringARef = useRef<HTMLDivElement>(null);
  const ringBRef = useRef<HTMLDivElement>(null);
  const fillRef = useRef<HTMLDivElement>(null);
  const animsRef = useRef<Anim[]>([]);
  const angleARef = useRef(0);
  const angleBRef = useRef(360);

  const colors = PALETTE[preset][theme];
  const half = Math.ceil(colors.length / 2);
  const colorsA = colors.slice(0, half);
  const colorsB = colors.slice(half);
  const fadeMaskDir = side === "left" ? "to right" : "to left";

  useEffect(() => {
    const ringA = ringARef.current;
    const ringB = ringBRef.current;
    const fill = fillRef.current;
    if (!ringA || !ringB || !fill) return;

    const stopsA = buildReflectionStops(colorsA);
    const stopsB = buildReflectionStops(colorsB);
    const anims: Anim[] = [];

    const proxyA = { angle: angleARef.current };
    anims.push(
      gsap.to(proxyA, {
        angle: "+=360",
        duration: SPIN_A_DURATION,
        repeat: -1,
        ease: "none",
        onUpdate() {
          angleARef.current = proxyA.angle % 360;
          const bg = `conic-gradient(from ${proxyA.angle + 180}deg, ${stopsA})`;
          ringA.style.background = bg;
          fill.style.background = bg;
        }
      })
    );

    const proxyB = { angle: angleBRef.current };
    anims.push(
      gsap.to(proxyB, {
        angle: "-=360",
        duration: SPIN_B_DURATION,
        repeat: -1,
        ease: "none",
        onUpdate() {
          angleBRef.current = ((proxyB.angle % 360) + 360) % 360;
          ringB.style.background = `conic-gradient(from ${proxyB.angle + 180}deg, ${stopsB})`;
        }
      })
    );

    animsRef.current = anims;
    return () => {
      anims.forEach((a) => a.kill());
      animsRef.current = [];
    };
  }, [colorsA, colorsB]);

  // biome-ignore lint/correctness/useExhaustiveDependencies: wrapRef is stable
  useEffect(() => {
    const wrap = wrapRef.current;
    if (!wrap) return;
    const obs = new IntersectionObserver(
      ([entry]) => {
        animsRef.current.forEach((a) => (entry.isIntersecting ? a.play() : a.pause()));
      },
      { threshold: 0 }
    );
    obs.observe(wrap);
    return () => obs.disconnect();
  }, []);

  const reflectionWrapStyle = useMemo<CSSProperties>(
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
      ref={wrapRef}
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
        <div
          ref={fillRef}
          style={{
            position: "absolute",
            inset: 0,
            borderRadius: "inherit",
            opacity: intensity * 0.1,
            pointerEvents: "none",
            filter: "blur(6px)",
            mixBlendMode: "screen"
          }}
        />
        <div
          ref={ringARef}
          style={{
            ...RING_MASK,
            inset: 1,
            opacity: intensity * 0.85,
            filter: "blur(4px)"
          }}
        />
        <div
          ref={ringBRef}
          style={{
            ...RING_MASK,
            inset: 0,
            opacity: intensity * 0.65
          }}
        />
      </div>
    </div>
  );
}
