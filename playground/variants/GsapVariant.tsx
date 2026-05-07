import { type CSSProperties, type ReactNode, useEffect, useMemo, useRef, useState } from "react";
import { gsap } from "gsap";
import {
  buildStops,
  GLOW_GA_DURATION,
  PALETTE,
  type Preset,
  SPIN_A_DURATION,
  SPIN_B_DURATION,
  type Theme
} from "./pureCssStyles";

export type { Preset, Theme };

type Anim = ReturnType<typeof gsap.to>;

const RING_BASE: CSSProperties = {
  position: "absolute",
  inset: 0,
  borderRadius: "inherit",
  padding: 1,
  WebkitMask: "linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0)",
  WebkitMaskComposite: "xor",
  maskComposite: "exclude",
  pointerEvents: "none",
  zIndex: 3
};

function perimeterPoint(t: number, w: number, h: number, r: number): [number, number] {
  const cr = Math.min(r, w / 2, h / 2);
  const sW = w - 2 * cr;
  const sH = h - 2 * cr;
  const arcLen = (Math.PI / 2) * cr;
  const halfW = sW / 2;
  const total = 2 * sW + 2 * sH + 4 * arcLen;
  if (total === 0) return [w / 2, 0];

  let d = (((t % 1) + 1) % 1) * total;

  if (d < halfW) return [w / 2 + d, 0];
  d -= halfW;

  if (d < arcLen) {
    const a = -Math.PI / 2 + (d / arcLen) * (Math.PI / 2);
    return [w - cr + cr * Math.cos(a), cr + cr * Math.sin(a)];
  }
  d -= arcLen;

  if (d < sH) return [w, cr + d];
  d -= sH;

  if (d < arcLen) {
    const a = (d / arcLen) * (Math.PI / 2);
    return [w - cr + cr * Math.cos(a), h - cr + cr * Math.sin(a)];
  }
  d -= arcLen;

  if (d < sW) return [w - cr - d, h];
  d -= sW;

  if (d < arcLen) {
    const a = Math.PI / 2 + (d / arcLen) * (Math.PI / 2);
    return [cr + cr * Math.cos(a), h - cr + cr * Math.sin(a)];
  }
  d -= arcLen;

  if (d < sH) return [0, h - cr - d];
  d -= sH;

  if (d < arcLen) {
    const a = Math.PI + (d / arcLen) * (Math.PI / 2);
    return [cr + cr * Math.cos(a), cr + cr * Math.sin(a)];
  }
  d -= arcLen;

  return [cr + d, 0];
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

export function GsapVariant({
  children,
  preset = "chromatic",
  theme = "dark",
  variant = "button",
  strength = 1,
  disableGlow = false,
  disableReflections = false
}: Props) {
  const rootRef = useRef<HTMLDivElement>(null);
  const ringARef = useRef<HTMLDivElement>(null);
  const ringBRef = useRef<HTMLDivElement>(null);
  const glowRef = useRef<HTMLDivElement>(null);
  const animsRef = useRef<Anim[]>([]);
  const angleARef = useRef(0);
  const angleBRef = useRef(360);
  const glowTRef = useRef(0);

  const [radius, setRadius] = useState(20);
  const [elSize, setElSize] = useState<[number, number]>([140, 40]);

  const colors = PALETTE[preset][theme];
  const isDark = theme === "dark";
  const isCircle = variant === "circle";
  const bg = isDark ? "#272727" : "#ffffff";
  const accentColor = colors[0];

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const measure = () => {
      const w = root.offsetWidth;
      const h = root.offsetHeight;
      setElSize((prev) => (prev[0] === w && prev[1] === h ? prev : [w, h]));
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

  useEffect(() => {
    const ringA = ringARef.current;
    const ringB = ringBRef.current;
    const glowEl = glowRef.current;
    if (!ringA || !ringB) return;

    const half = Math.ceil(colors.length / 2);
    const stopsA = buildStops(colors.slice(0, half));
    const stopsB = buildStops(colors.slice(half));
    const [w, h] = elSize;
    const r = Math.min(radius, w / 2, h / 2);
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
          ringA.style.background = `conic-gradient(from ${proxyA.angle}deg, ${stopsA})`;
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
          ringB.style.background = `conic-gradient(from ${proxyB.angle}deg, ${stopsB})`;
        }
      })
    );

    if (glowEl && !disableGlow) {
      const glowSize = 32;
      const glowProxy = { t: glowTRef.current };

      anims.push(
        gsap.to(glowProxy, {
          t: "+=1",
          duration: SPIN_A_DURATION,
          repeat: -1,
          ease: "none",
          onUpdate() {
            glowTRef.current = glowProxy.t % 1;
            const [x, y] = perimeterPoint(glowProxy.t, w, h, r);
            glowEl.style.transform = `translate(${x - glowSize / 2}px, ${y - glowSize / 2}px)`;
          }
        })
      );

      anims.push(
        gsap.fromTo(
          glowEl,
          { opacity: strength * 0.3 },
          {
            opacity: strength * 0.7,
            duration: SPIN_A_DURATION / 8,
            repeat: -1,
            yoyo: true,
            ease: "sine.inOut"
          }
        )
      );

      const colorProxy = { idx: 0 };
      anims.push(
        gsap.to(colorProxy, {
          idx: colors.length,
          duration: GLOW_GA_DURATION,
          repeat: -1,
          ease: "none",
          onUpdate() {
            const i = Math.floor(colorProxy.idx) % colors.length;
            const frac = colorProxy.idx - Math.floor(colorProxy.idx);
            const next = (i + 1) % colors.length;
            const c = gsap.utils.interpolate(colors[i], colors[next], frac);
            glowEl.style.background = `radial-gradient(circle, ${c} 0%, transparent 70%)`;
          }
        })
      );
    }

    animsRef.current = anims;
    return () => {
      anims.forEach((a) => a.kill());
      animsRef.current = [];
    };
  }, [colors, strength, disableGlow, elSize, radius]);

  // biome-ignore lint/correctness/useExhaustiveDependencies: rootRef is stable, animsRef is intentionally read from ref
  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const obs = new IntersectionObserver(
      ([entry]) => {
        animsRef.current.forEach((a) => (entry.isIntersecting ? a.play() : a.pause()));
      },
      { threshold: 0 }
    );
    obs.observe(root);
    return () => obs.disconnect();
  }, []);

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

  return (
    <div
      ref={rootRef}
      style={{
        position: "relative",
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        background: bg,
        borderRadius: radius,
        isolation: "isolate",
        overflow: "visible",
        contain: "layout style"
      }}
    >
      <div ref={ringARef} style={{ ...RING_BASE, opacity: strength * 0.85 }} aria-hidden="true" />
      <div ref={ringBRef} style={{ ...RING_BASE, opacity: strength * 0.65 }} aria-hidden="true" />
      <div
        ref={glowRef}
        style={{
          position: "absolute",
          width: 32,
          height: 32,
          borderRadius: "50%",
          filter: "blur(8px)",
          pointerEvents: "none",
          zIndex: 1,
          top: 0,
          left: 0,
          display: disableGlow ? "none" : undefined
        }}
        aria-hidden="true"
      />
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
  );
}
