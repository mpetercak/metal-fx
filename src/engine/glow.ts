/**
 * SVG glow overlay — a luminance-driven halo that tracks the brightest point
 * on the shader's perimeter.
 *
 * How it works:
 *   1. Samples luminance at N points around the component's perimeter.
 *   2. A state machine tracks which perimeter point is brightest, with dwell
 *      timers and fade-in/out transitions when relocating to a new hotspot.
 *   3. SVG path elements (blurred strokes at multiple radii) are positioned
 *      at the current hotspot with slight "wander" motion for organic feel.
 *   4. The stroke color is tinted to match the shader's color at that point.
 */
import type { MetalFxInstance, ShaderRGB } from './renderer';
import { sampleShaderLumAt, sampleShaderRGBAt, sampleShaderRGBChromatic } from './renderer';
import { type Tween, ease, tween, tweenStart, tweenTick } from './tween';

// ─── Constants ────────────────────────────────────────────────────────────

const FADE_RATE = 0.00875;          // Opacity convergence rate per frame
const LO = 0.08, HI = 0.32;         // Luminance range for opacity mapping
const RELOCATE_DELTA = 0.05;         // Min lum difference to trigger relocation
const MIN_DWELL_MS = 3000;           // Minimum time before relocating to a brighter spot
const PEAK_OP = 0.85, BASE_OP = 0.34; // Opacity range (dim at low lum, bright at high)
const RELOC_FADE_MS = 500;           // Duration of fade-out/in during relocation
const PERIM_SAMPLES = 24;            // Number of perimeter points to scan per update
const WANDER_RANGE = 15, WANDER_LERP = 0.0075, WANDER_RETARGET = 120; // Subtle drift
const INSET = 1.5;                   // How far inside the border the halo sits (CSS-px)
// Main halo (wide blurred strokes)
const HALO_HALFLEN = 7.8, HALO_SEGMENTS = 28, HALO_WOBBLE = 0.4;
// Extra highlight (tight concentrated glow on top of halo)
const EXTRA_HALFLEN = 9.13952, EXTRA_SEGMENTS = 12, EXTRA_OUTWARD = 1.0;
const EXTRA_SCALE = 1 / 3;
const EXTRA_STROKE_OUTER = 4.0 * EXTRA_SCALE;
const EXTRA_STROKE_CORE = 2.0 * EXTRA_SCALE;
const EXTRA_BLUR_OUTER = 2.0 * EXTRA_SCALE;
const EXTRA_BLUR_CORE = 1.35 * EXTRA_SCALE;
const EXTRA_FADE_R = 13.0 * EXTRA_SCALE;
const HALO_OP_MUL = 0.8;
const EXTRA_INTENSITY = 3.51;
// Tint color transition
const TINT_HOLD_MS = 2000, TINT_FADE_MS = 400;
// Light-mode color adjustments
const LT_SAT_BOOST = 2.625, LT_VAL_MULT = 1.008, LT_MIN_VAL = 0.31;
// Reference dimensions for scaling wander/halo proportionally
const REF_W = 140, REF_H = 40, REF_R = 20;

// ─── Types ────────────────────────────────────────────────────────────────

interface GlowOptions { width: number; height: number; cornerRadius: number; kind: 'pill' | 'circle' }
interface Pt { x: number; y: number }
interface PerimSample extends Pt { arc: number }

export interface GlowHandles {
  svg: SVGSVGElement;
  haloGroup: SVGGElement;
  haloPaths: SVGPathElement[];
  extraGroup: SVGGElement;
  extraPaths: SVGPathElement[];
  fadeCircle: SVGCircleElement;
  width: number; height: number; cornerRadius: number; kind: 'pill' | 'circle';
  perim: PerimSample[];
  currentIdx: number; appearedAt: number; glowOpacity: number;
  relocTween: Tween | null; relocNextIdx: number;
  wanderS: number; wanderTargetS: number; wanderFrames: number;
  tintFrom: ShaderRGB; tintTarget: ShaderRGB; tintTween: Tween | null; tintHoldUntil: number;
  lastHaloStroke: string; lastExtraStroke: string;
}

let glowIdSeq = 0;

// ─── Geometry ─────────────────────────────────────────────────────────────
// Functions for computing perimeter length and sampling points along a
// rounded-rect or circle border. Used to place the glow halo at any
// arbitrary arc-length position around the shape.

/** Total perimeter length of a rounded rectangle. */
function rrPerim(w: number, h: number, r: number): number {
  const rr = Math.max(0, Math.min(r, Math.min(w, h) / 2));
  return 2 * Math.max(0, w - 2 * rr) + 2 * Math.max(0, h - 2 * rr) + 2 * Math.PI * rr;
}

function shapePerim(w: number, h: number, r: number, kind: 'pill' | 'circle'): number {
  if (kind === 'circle') return 2 * Math.PI * Math.max(0, Math.min(r, Math.min(w, h) / 2));
  return rrPerim(w, h, r);
}

/** Return the (x,y) point at arc-length `s` along the shape perimeter,
 *  offset inward by `inset` and outward by `outward`. */
function sampleAtArc(s: number, w: number, h: number, r: number, inset: number, outward: number, kind: 'pill' | 'circle'): Pt {
  const rr = Math.max(0, Math.min(r, Math.min(w, h) / 2));
  if (kind === 'circle') {
    const perim = 2 * Math.PI * rr;
    if (perim <= 0.0001) return { x: w * 0.5, y: h * 0.5 };
    s = ((s % perim) + perim) % perim;
    const theta = -Math.PI / 2 + (s / perim) * Math.PI * 2;
    const rad = Math.max(0, rr - inset + outward);
    return { x: w * 0.5 + rad * Math.cos(theta), y: h * 0.5 + rad * Math.sin(theta) };
  }
  const topLen = Math.max(0, w - 2 * rr), sideLen = Math.max(0, h - 2 * rr);
  const arcLen = (Math.PI * rr) / 2;
  const perim = 2 * (topLen + sideLen) + 4 * arcLen;
  s = ((s % perim) + perim) % perim;
  const rad = Math.max(0, rr - inset + outward);
  const arc = (cx: number, cy: number, a0: number, local: number): Pt => {
    const theta = a0 + (arcLen > 0 ? local / arcLen : 0) * (Math.PI / 2);
    return { x: cx + rad * Math.cos(theta), y: cy + rad * Math.sin(theta) };
  };
  let d = s;
  if (d < topLen) return { x: rr + d, y: inset - outward };
  d -= topLen;
  if (d < arcLen) return arc(w - rr, rr, -Math.PI / 2, d);
  d -= arcLen;
  if (d < sideLen) return { x: w - inset + outward, y: rr + d };
  d -= sideLen;
  if (d < arcLen) return arc(w - rr, h - rr, 0, d);
  d -= arcLen;
  if (d < topLen) return { x: w - rr - d, y: h - inset + outward };
  d -= topLen;
  if (d < arcLen) return arc(rr, h - rr, Math.PI / 2, d);
  d -= arcLen;
  if (d < sideLen) return { x: inset - outward, y: h - rr - d };
  d -= sideLen;
  return arc(rr, rr, Math.PI, d);
}

/** Build an SVG path string for a halo blob centered at `centerArc` with optional
 *  sinusoidal wobble for organic motion. */
function buildBlobPath(w: number, h: number, r: number, kind: 'pill' | 'circle', centerArc: number, halfLen: number, segments: number, outward: number, wobbleAmp: number, nowMs: number): string {
  const step = (halfLen * 2) / segments;
  const tw = wobbleAmp > 0 ? nowMs * 0.001 : 0;
  let d = '';
  for (let i = 0; i <= segments; i++) {
    const arc = centerArc - halfLen + i * step;
    let off = outward;
    if (wobbleAmp > 0) off += (Math.sin(arc * 0.55 + tw * 0.9) + 0.5 * Math.sin(arc * 1.7 + tw * 1.4 + 1.3)) * wobbleAmp;
    const pt = sampleAtArc(arc, w, h, r, INSET, off, kind);
    d += (i === 0 ? 'M ' : 'L ') + pt.x.toFixed(3) + ' ' + pt.y.toFixed(3) + ' ';
  }
  return d;
}

function smoothstep(a: number, b: number, x: number): number {
  if (a === b) return x < a ? 0 : 1;
  const t = Math.max(0, Math.min(1, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}

function buildPerimTable(opts: GlowOptions): PerimSample[] {
  const perim = shapePerim(opts.width, opts.height, opts.cornerRadius, opts.kind);
  const table: PerimSample[] = [];
  for (let i = 0; i < PERIM_SAMPLES; i++) {
    const arc = (i / PERIM_SAMPLES) * perim;
    const pt = sampleAtArc(arc, opts.width, opts.height, opts.cornerRadius, INSET, 0, opts.kind);
    table.push({ x: pt.x, y: pt.y, arc });
  }
  return table;
}

// ─── SVG construction ─────────────────────────────────────────────────────
// The glow is rendered as overlapping SVG paths with Gaussian blur filters
// at different radii (XL/Lg/Md/Sm), masked to the ring area via a
// rounded-rect clip mask. The "extra" group adds a concentrated highlight
// with its own radial fade mask for a focused hot-spot.

function buildSvgMarkup(opts: GlowOptions, p: string): string {
  const { width: W, height: H, cornerRadius: R } = opts;
  const ringInset = opts.kind === 'circle' ? 2 : 1;
  const innerR = Math.max(0, R - ringInset);
  const cx = W * 0.5, cy = H * 0.5;
  const fr = 'x="-200" y="-200" width="540" height="440" filterUnits="userSpaceOnUse" color-interpolation-filters="sRGB"';
  return [
    '<defs>',
    `<filter id="${p}_bXl" ${fr}><feGaussianBlur stdDeviation="8.4"/></filter>`,
    `<filter id="${p}_bLg" ${fr}><feGaussianBlur stdDeviation="4.8"/></filter>`,
    `<filter id="${p}_bMd" ${fr}><feGaussianBlur stdDeviation="2.1"/></filter>`,
    `<filter id="${p}_bSm" ${fr}><feGaussianBlur stdDeviation="0.9"/></filter>`,
    `<filter id="${p}_ebO" ${fr}><feGaussianBlur stdDeviation="${EXTRA_BLUR_OUTER.toFixed(3)}"/></filter>`,
    `<filter id="${p}_ebC" ${fr}><feGaussianBlur stdDeviation="${EXTRA_BLUR_CORE.toFixed(3)}"/></filter>`,
    `<radialGradient id="${p}_fg" cx="0.5" cy="0.5" r="0.5"><stop offset="0" stop-color="white"/><stop offset="0.30" stop-color="white"/><stop offset="0.65" stop-color="#404040"/><stop offset="1" stop-color="black"/></radialGradient>`,
    `<mask id="${p}_fm" maskUnits="userSpaceOnUse" x="-200" y="-200" width="540" height="440"><rect x="-200" y="-200" width="540" height="440" fill="black"/><circle id="${p}_fc" cx="${cx}" cy="${cy}" r="${EXTRA_FADE_R.toFixed(3)}" fill="url(#${p}_fg)"/></mask>`,
    `<mask id="${p}_rm" maskUnits="userSpaceOnUse" x="-200" y="-200" width="540" height="440"><rect x="-200" y="-200" width="540" height="440" fill="#808080"/><rect x="0" y="0" width="${W}" height="${H}" rx="${R}" ry="${R}" fill="white"/><rect x="${ringInset}" y="${ringInset}" width="${W - ringInset * 2}" height="${H - ringInset * 2}" rx="${innerR}" ry="${innerR}" fill="black"/></mask>`,
    '</defs>',
    `<g id="${p}_h" mask="url(#${p}_rm)" opacity="0">`,
    `<path id="${p}_pXl" stroke="white" stroke-width="26.4" stroke-linecap="round" stroke-linejoin="round" fill="none" opacity="0.385" filter="url(#${p}_bXl)"/>`,
    `<path id="${p}_pLg" stroke="white" stroke-width="15.6" stroke-linecap="round" stroke-linejoin="round" fill="none" opacity="0.595" filter="url(#${p}_bLg)"/>`,
    `<path id="${p}_pMd" stroke="white" stroke-width="7.2" stroke-linecap="round" stroke-linejoin="round" fill="none" opacity="0.70" filter="url(#${p}_bMd)"/>`,
    `<path id="${p}_pSm" stroke="white" stroke-width="3.0" stroke-linecap="round" stroke-linejoin="round" fill="none" opacity="0.70" filter="url(#${p}_bSm)"/>`,
    '</g>',
    `<g id="${p}_e" mask="url(#${p}_rm)" opacity="0"><g mask="url(#${p}_fm)">`,
    `<path id="${p}_eO" stroke="white" stroke-width="${EXTRA_STROKE_OUTER.toFixed(3)}" stroke-linecap="round" stroke-linejoin="round" fill="none" opacity="0.85" filter="url(#${p}_ebO)"/>`,
    `<path id="${p}_eC" stroke="white" stroke-width="${EXTRA_STROKE_CORE.toFixed(3)}" stroke-linecap="round" stroke-linejoin="round" fill="none" opacity="1.0" filter="url(#${p}_ebC)"/>`,
    '</g></g>',
  ].join('');
}

// ─── Public API ───────────────────────────────────────────────────────────

export function injectGlow(container: HTMLElement, opts: GlowOptions): GlowHandles {
  const p = `mfxg_${++glowIdSeq}`;
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('class', 'metal-fx-glow-svg');
  svg.setAttribute('preserveAspectRatio', 'none');
  svg.setAttribute('viewBox', `0 0 ${opts.width} ${opts.height}`);
  svg.setAttribute('aria-hidden', 'true');
  svg.innerHTML = buildSvgMarkup(opts, p);
  container.appendChild(svg);

  const q = (id: string) => svg.querySelector(`#${p}_${id}`) as SVGElement;
  const haloGroup = q('h') as SVGGElement;
  const extraGroup = q('e') as SVGGElement;
  const glowTransition = 'transform 100ms linear, opacity 100ms linear';
  haloGroup.style.transition = glowTransition;
  extraGroup.style.transition = glowTransition;

  return {
    svg, haloGroup, extraGroup,
    haloPaths: [q('pXl'), q('pLg'), q('pMd'), q('pSm')] as SVGPathElement[],
    extraPaths: [q('eO'), q('eC')] as SVGPathElement[],
    fadeCircle: q('fc') as SVGCircleElement,
    width: opts.width, height: opts.height, cornerRadius: opts.cornerRadius, kind: opts.kind,
    perim: buildPerimTable(opts),
    currentIdx: 0, appearedAt: 0, glowOpacity: 0,
    relocTween: null, relocNextIdx: -1,
    wanderS: 0, wanderTargetS: 0, wanderFrames: 0,
    tintFrom: { r: 255, g: 255, b: 255 }, tintTarget: { r: 255, g: 255, b: 255 }, tintTween: null, tintHoldUntil: 0,
    lastHaloStroke: '', lastExtraStroke: '',
  };
}

// ─── HSV helpers ──────────────────────────────────────────────────────────

function rgbToHsv(r: number, g: number, b: number): [number, number, number] {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min;
  let h = 0;
  const s = max === 0 ? 0 : d / max;
  if (d !== 0) {
    if (max === r) h = ((g - b) / d + 6) % 6;
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h /= 6;
  }
  return [h, s, max];
}

function hsvToRgb(h: number, s: number, v: number): [number, number, number] {
  const i = Math.floor(h * 6), f = h * 6 - i;
  const p = v * (1 - s), q = v * (1 - f * s), t = v * (1 - (1 - f) * s);
  let r = 0, g = 0, b = 0;
  switch (i % 6) {
    case 0: r = v; g = t; b = p; break; case 1: r = q; g = v; b = p; break;
    case 2: r = p; g = v; b = t; break; case 3: r = p; g = q; b = v; break;
    case 4: r = t; g = p; b = v; break; case 5: r = v; g = p; b = q; break;
  }
  return [Math.round(r * 255), Math.round(g * 255), Math.round(b * 255)];
}

// ─── Per-frame update ─────────────────────────────────────────────────────
// Called once per glow tick (staggered, ~1 per frame for this instance).
// Steps: scan brightness → run state machine → update wander → rebuild
// SVG paths → sample tint color → set opacity.

export function updateGlow(h: GlowHandles, inst: MetalFxInstance, nowMs: number, strengthMul: number, theme: 'dark' | 'light' = 'dark'): void {
  const { width: W, height: H, cornerRadius: R, perim } = h;
  if (perim.length === 0) return;

  const halfWin = 2;

  // Step 1: brightness scan (coordinates are CSS-px, sampler maps internally)
  let maxLum = -1, maxIdx = h.currentIdx, curLum = 0;
  for (let i = 0; i < perim.length; i++) {
    const pt = perim[i];
    const lum = sampleShaderLumAt(inst, pt.x, pt.y, halfWin);
    if (lum > maxLum) { maxLum = lum; maxIdx = i; }
    if (i === h.currentIdx) curLum = lum;
  }

  // Step 2: relocation / opacity
  const dwellActive = h.appearedAt > 0 && nowMs - h.appearedAt < MIN_DWELL_MS;
  const targetOp = BASE_OP + (PEAK_OP - BASE_OP) * smoothstep(LO, HI, curLum);
  const rivalDominates = !dwellActive && maxLum - curLum > RELOCATE_DELTA;

  if (!h.relocTween || h.relocTween.done) {
    if (h.appearedAt === 0) {
      h.currentIdx = maxIdx; h.appearedAt = nowMs;
      h.wanderS = 0; h.wanderTargetS = 0; h.wanderFrames = 0;
      h.relocTween = tween(0, targetOp, RELOC_FADE_MS, ease.smoothstep);
      tweenStart(h.relocTween, nowMs);
    } else if (h.relocTween?.done && h.relocTween.to === 0) {
      h.currentIdx = h.relocNextIdx; h.appearedAt = nowMs;
      h.wanderS = 0; h.wanderTargetS = 0; h.wanderFrames = 0;
      const np = perim[h.currentIdx];
      const nl = sampleShaderLumAt(inst, np.x, np.y, halfWin);
      const fadeInTarget = BASE_OP + (PEAK_OP - BASE_OP) * smoothstep(LO, HI, nl);
      h.relocTween = tween(0, fadeInTarget, RELOC_FADE_MS, ease.smoothstep);
      tweenStart(h.relocTween, nowMs);
    } else if (rivalDominates) {
      h.relocNextIdx = maxIdx;
      h.relocTween = tween(h.glowOpacity, 0, RELOC_FADE_MS, ease.smoothstep);
      tweenStart(h.relocTween, nowMs);
    } else {
      h.glowOpacity += (targetOp - h.glowOpacity) * FADE_RATE;
    }
  }

  if (h.relocTween && !h.relocTween.done) {
    h.glowOpacity = tweenTick(h.relocTween, nowMs);
  }
  h.glowOpacity = Math.max(0, Math.min(1, h.glowOpacity));

  // Step 3: wander
  const ratio = shapePerim(W, H, R, h.kind) / rrPerim(REF_W, REF_H, REF_R);
  const wanderRange = WANDER_RANGE * ratio;
  if (h.wanderFrames++ >= WANDER_RETARGET) { h.wanderTargetS = (Math.random() * 2 - 1) * wanderRange; h.wanderFrames = 0; }
  h.wanderS += (h.wanderTargetS - h.wanderS) * WANDER_LERP;

  // Step 4: paths
  const blobArc = perim[h.currentIdx].arc + h.wanderS;
  const haloHL = Math.max(1, HALO_HALFLEN * ratio);
  const haloD = buildBlobPath(W, H, R, h.kind, blobArc, haloHL, HALO_SEGMENTS, 0, HALO_WOBBLE * ratio, nowMs);
  const extraHL = Math.max(0.6, EXTRA_HALFLEN * EXTRA_SCALE * ratio);
  const extraOut = EXTRA_OUTWARD * ratio;
  const extraD = buildBlobPath(W, H, R, h.kind, blobArc, extraHL, EXTRA_SEGMENTS, extraOut, 0, nowMs);

  for (const p of h.haloPaths) p.setAttribute('d', haloD);
  for (const p of h.extraPaths) p.setAttribute('d', extraD);
  const center = sampleAtArc(blobArc, W, H, R, INSET, extraOut, h.kind);
  h.fadeCircle.setAttribute('cx', center.x.toFixed(3));
  h.fadeCircle.setAttribute('cy', center.y.toFixed(3));

  // Step 5: tint
  const light = theme === 'light';
  const blobPt = sampleAtArc(blobArc, W, H, R, INSET, 0, h.kind);
  const samp = light
    ? sampleShaderRGBChromatic(inst, blobPt.x, blobPt.y, halfWin)
    : sampleShaderRGBAt(inst, blobPt.x, blobPt.y, halfWin);

  if (!h.tintTween) {
    h.tintFrom = { ...samp }; h.tintTarget = { ...samp };
    h.tintTween = tween(0, 1, TINT_FADE_MS);
    tweenStart(h.tintTween, nowMs);
    h.tintHoldUntil = light ? 0 : nowMs + TINT_HOLD_MS;
  } else if (h.tintTween.done) {
    if (light) {
      h.tintFrom = {
        r: h.tintFrom.r + (h.tintTarget.r - h.tintFrom.r) * h.tintTween.val,
        g: h.tintFrom.g + (h.tintTarget.g - h.tintFrom.g) * h.tintTween.val,
        b: h.tintFrom.b + (h.tintTarget.b - h.tintFrom.b) * h.tintTween.val,
      };
      h.tintTarget = { ...samp };
      h.tintTween = tween(0, 1, TINT_FADE_MS);
      tweenStart(h.tintTween, nowMs);
    } else if (nowMs >= h.tintHoldUntil) {
      h.tintFrom = { ...h.tintTarget };
      h.tintTarget = { ...samp };
      h.tintTween = tween(0, 1, TINT_FADE_MS);
      tweenStart(h.tintTween, nowMs);
      h.tintHoldUntil = nowMs + TINT_HOLD_MS;
    }
  }
  tweenTick(h.tintTween!, nowMs);
  const ft = h.tintTween!.val;

  let tR: number, tG: number, tB: number;
  if (light) {
    tR = Math.round(h.tintFrom.r + (h.tintTarget.r - h.tintFrom.r) * ft);
    tG = Math.round(h.tintFrom.g + (h.tintTarget.g - h.tintFrom.g) * ft);
    tB = Math.round(h.tintFrom.b + (h.tintTarget.b - h.tintFrom.b) * ft);
  } else {
    const hR = h.tintFrom.r + (h.tintTarget.r - h.tintFrom.r) * ft;
    const hG = h.tintFrom.g + (h.tintTarget.g - h.tintFrom.g) * ft;
    const hB = h.tintFrom.b + (h.tintTarget.b - h.tintFrom.b) * ft;
    const peak = Math.max(hR, hG, hB) || 1;
    tR = Math.round(255 * (hR / peak)); tG = Math.round(255 * (hG / peak)); tB = Math.round(255 * (hB / peak));
  }

  const tinted = `rgb(${tR},${tG},${tB})`;
  if (tinted !== h.lastHaloStroke) { h.lastHaloStroke = tinted; for (const p of h.haloPaths) p.setAttribute('stroke', tinted); }

  if (light) {
    const hsv = rgbToHsv(tR, tG, tB);
    const [er, eg, eb] = hsvToRgb(hsv[0], Math.min(1, hsv[1] * LT_SAT_BOOST), Math.max(LT_MIN_VAL, hsv[2] * LT_VAL_MULT));
    const extraTinted = `rgb(${er},${eg},${eb})`;
    if (extraTinted !== h.lastExtraStroke) { h.lastExtraStroke = extraTinted; for (const p of h.extraPaths) p.setAttribute('stroke', extraTinted); }
  } else if (h.lastExtraStroke !== '#ffffff') {
    h.lastExtraStroke = '#ffffff'; for (const p of h.extraPaths) p.setAttribute('stroke', '#ffffff');
  }

  // Step 6: opacity
  const m = Math.max(0, Math.min(1, strengthMul));
  h.haloGroup.setAttribute('opacity', (h.glowOpacity * HALO_OP_MUL * m).toFixed(3));
  h.extraGroup.setAttribute('opacity', Math.min(1, h.glowOpacity * EXTRA_INTENSITY * m).toFixed(3));
}

export function resizeGlow(handles: GlowHandles, container: HTMLElement, opts: GlowOptions): GlowHandles {
  for (const svg of Array.from(container.querySelectorAll('.metal-fx-glow-svg'))) {
    if (svg.parentNode === container) container.removeChild(svg);
  }
  void handles;
  return injectGlow(container, opts);
}
