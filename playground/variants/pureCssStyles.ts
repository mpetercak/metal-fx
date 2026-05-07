import { useEffect } from "react";

export type Preset = "chromatic" | "silver" | "gold";
export type Theme = "dark" | "light";

export const PALETTE: Record<Preset, Record<Theme, string[]>> = {
  chromatic: {
    dark: ["#aae8ff", "#c5fe9e", "#f7888d", "#fffdc3"],
    light: ["#f0a0a0", "#c8d888", "#70c090", "#90a8e0"]
  },
  silver: {
    dark: ["#dedede", "#747270", "#e5e5e5", "#ffffff"],
    light: ["#b0b0b0", "#d0d0d0", "#a0a0a0", "#c8c8c8"]
  },
  gold: {
    dark: ["#ffffff", "#f7d488", "#fffdc3", "#ffffff"],
    light: ["#d4b060", "#c8a848", "#e0c878", "#b89840"]
  }
};

export const GLOW_ANGLES = [0, 140, 200, 290];

export function getBaseKey(preset: string, theme: string): string {
  return `${preset}-${theme}`;
}

const registry = new Map<string, { el: HTMLStyleElement; refs: number }>();

function buildSharedCss(
  regKey: string,
  baseKey: string,
  strength: number,
  colorsA: string[],
  colorsB: string[]
): string {
  const o = strength * 0.7;
  return `
@property --mfx-a-${baseKey} { syntax: '<angle>'; initial-value: 0deg; inherits: false; }
@property --mfx-b-${baseKey} { syntax: '<angle>'; initial-value: 0deg; inherits: false; }
@property --mfx-ga-${baseKey} { syntax: '<color>'; initial-value: ${colorsA[0]}; inherits: false; }
@property --mfx-gb-${baseKey} { syntax: '<color>'; initial-value: ${colorsB[0]}; inherits: false; }
@keyframes mfx-spin-a-${baseKey} {
  0%{--mfx-a-${baseKey}:${GLOW_ANGLES[0]}deg}
  24%{--mfx-a-${baseKey}:${GLOW_ANGLES[0]}deg}
  29%{--mfx-a-${baseKey}:${GLOW_ANGLES[1]}deg}
  49%{--mfx-a-${baseKey}:${GLOW_ANGLES[1]}deg}
  54%{--mfx-a-${baseKey}:${GLOW_ANGLES[2]}deg}
  74%{--mfx-a-${baseKey}:${GLOW_ANGLES[2]}deg}
  79%{--mfx-a-${baseKey}:${GLOW_ANGLES[3]}deg}
  99%{--mfx-a-${baseKey}:${GLOW_ANGLES[3]}deg}
  100%{--mfx-a-${baseKey}:${GLOW_ANGLES[0] + 360}deg}
}
@keyframes mfx-spin-b-${baseKey} {
  0%{--mfx-b-${baseKey}:0deg}30%{--mfx-b-${baseKey}:120deg}60%{--mfx-b-${baseKey}:250deg}100%{--mfx-b-${baseKey}:360deg}
}
@keyframes mfx-glow-fade-${regKey} {
  0%{opacity:0}4%{opacity:${o}}20%{opacity:${o}}24%{opacity:0}
  25%{opacity:0}29%{opacity:${o}}45%{opacity:${o}}49%{opacity:0}
  50%{opacity:0}54%{opacity:${o}}70%{opacity:${o}}74%{opacity:0}
  75%{opacity:0}79%{opacity:${o}}95%{opacity:${o}}99%{opacity:0}100%{opacity:0}
}
@keyframes mfx-glow-ga-${baseKey} {
  ${colorsA
    .map((c, i) => {
      const seg = 100 / colorsA.length;
      return `${Math.round(seg * i + seg * 0.3)}%{--mfx-ga-${baseKey}:transparent}${Math.round(seg * i + seg * 0.47)}%{--mfx-ga-${baseKey}:${c}}${Math.round(seg * i + seg * 0.65)}%{--mfx-ga-${baseKey}:transparent}`;
    })
    .join("")}
}
@keyframes mfx-glow-gb-${baseKey} {
  ${colorsB
    .map((c, i) => {
      const seg = 100 / colorsB.length;
      return `${Math.round(seg * i + seg * 0.3)}%{--mfx-gb-${baseKey}:transparent}${Math.round(seg * i + seg * 0.47)}%{--mfx-gb-${baseKey}:${c}}${Math.round(seg * i + seg * 0.65)}%{--mfx-gb-${baseKey}:transparent}`;
    })
    .join("")}
}`;
}

export function usePureCssStyles(preset: Preset, theme: Theme, strength: number): string {
  const colors = PALETTE[preset][theme];
  const half = Math.ceil(colors.length / 2);
  const colorsA = colors.slice(0, half);
  const colorsB = colors.slice(half);
  const regKey = `${preset}-${theme}-s${Math.round(strength * 100)}`;
  const baseKey = getBaseKey(preset, theme);

  useEffect(() => {
    const existing = registry.get(regKey);
    if (existing) {
      existing.refs++;
    } else {
      const el = document.createElement("style");
      el.setAttribute("data-mfx-shared", regKey);
      el.textContent = buildSharedCss(regKey, baseKey, strength, colorsA, colorsB);
      document.head.appendChild(el);
      registry.set(regKey, { el, refs: 1 });
    }
    return () => {
      const entry = registry.get(regKey);
      if (entry) {
        entry.refs--;
        if (entry.refs <= 0) {
          entry.el.remove();
          registry.delete(regKey);
        }
      }
    };
  }, [regKey, baseKey, strength, colorsA, colorsB]);

  return regKey;
}

export function buildStops(cols: string[]): string {
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
  return s.join(",");
}

export function buildReflectionStops(cols: string[]): string {
  const s: string[] = [];
  const n = cols.length;
  const span = 100 / n;
  for (let i = 0; i < n; i++) {
    const start = span * i;
    s.push(`transparent ${start}%`);
    s.push(`${cols[i]}88 ${start + span * 0.44}%`);
    s.push(`${cols[i]} ${start + span * 0.47}%`);
    s.push(`${cols[i]}88 ${start + span * 0.5}%`);
    s.push(`transparent ${start + span * 0.55}%`);
  }
  return s.join(",");
}
