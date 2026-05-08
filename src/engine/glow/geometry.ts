/**
 * Pure geometry + SVG markup for the glow overlay.
 *
 * Perimeter math (rounded-rect / circle arc-length sampling), blob path
 * generation, SVG filter/mask construction, and HSV colour helpers.
 * No state — every function is a pure transform.
 */

const INSET = 1.5;
const EXTRA_SCALE = 1 / 3;
const EXTRA_STROKE_OUTER = 4.0 * EXTRA_SCALE;
const EXTRA_STROKE_CORE = 2.0 * EXTRA_SCALE;
const EXTRA_BLUR_OUTER = 2.0 * EXTRA_SCALE;
const EXTRA_BLUR_CORE = 1.35 * EXTRA_SCALE;
const EXTRA_FADE_R = 13.0 * EXTRA_SCALE;

export const PERIM_SAMPLES = 24;

export interface GlowOptions { width: number; height: number; cornerRadius: number; kind: 'pill' | 'circle' }
export interface Pt { x: number; y: number }
export interface PerimSample extends Pt { arc: number }

export function rrPerim(w: number, h: number, r: number): number {
  const rr = Math.max(0, Math.min(r, Math.min(w, h) / 2));
  return 2 * Math.max(0, w - 2 * rr) + 2 * Math.max(0, h - 2 * rr) + 2 * Math.PI * rr;
}

export function shapePerim(w: number, h: number, r: number, kind: 'pill' | 'circle'): number {
  if (kind === 'circle') return 2 * Math.PI * Math.max(0, Math.min(r, Math.min(w, h) / 2));
  return rrPerim(w, h, r);
}

export function sampleAtArc(s: number, w: number, h: number, r: number, inset: number, outward: number, kind: 'pill' | 'circle'): Pt {
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

export function buildBlobPath(w: number, h: number, r: number, kind: 'pill' | 'circle', centerArc: number, halfLen: number, segments: number, outward: number, wobbleAmp: number, nowMs: number): string {
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

export function smoothstep(a: number, b: number, x: number): number {
  if (a === b) return x < a ? 0 : 1;
  const t = Math.max(0, Math.min(1, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}

export function buildPerimTable(opts: GlowOptions): PerimSample[] {
  const perim = shapePerim(opts.width, opts.height, opts.cornerRadius, opts.kind);
  const table: PerimSample[] = [];
  for (let i = 0; i < PERIM_SAMPLES; i++) {
    const arc = (i / PERIM_SAMPLES) * perim;
    const pt = sampleAtArc(arc, opts.width, opts.height, opts.cornerRadius, INSET, 0, opts.kind);
    table.push({ x: pt.x, y: pt.y, arc });
  }
  return table;
}

export function buildSvgMarkup(opts: GlowOptions, p: string): string {
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

export function rgbToHsv(r: number, g: number, b: number): [number, number, number] {
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

export function hsvToRgb(h: number, s: number, v: number): [number, number, number] {
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
