/**
 * Shared renderer for the metal-fx effect.
 *
 * Architecture (mirrors `Image loader/index.html` 1:1):
 *   • One off-screen 300×300 (×DPR) WebGL canvas runs the Plasma shader.
 *     This is the canonical render target — the same `canvas` used by
 *     `metal.html` to drive its `btnDisplay` 140×40 pipeline.
 *   • A virtual 140×40 (×DPR) "btnDisplay" surface is the per-CSS-px
 *     reference for every aux instance (we don't actually allocate it; the
 *     dimensions are computed). Each instance copies a centred CROP of the
 *     GL canvas onto its own 2D canvas using the SAME per-CSS-px ratio as
 *     the canonical pill, then divides the source window by the instance's
 *     `shaderScale` to zoom features when the host is smaller (circle hosts)
 *     or to dial scale to taste (Button variant uses `1.6`).
 *   • Each instance then punches a rounded-rect inner hole on its own
 *     canvas so only the outer ring of the shader survives. The visible
 *     "metal frame" look comes from the consumer's `.metal-fx-inner` div
 *     covering the hole.
 *
 * This file owns the GL context (one per page), the program, the uniform
 * uploads, the shared RAF loop, and the per-instance copy + punch logic.
 */
import {
  FRAG_SHADER_SRC,
  VERT_SHADER_SRC,
  compileShader,
  linkProgram,
} from './shaders';
import {
  PRESETS,
  hexToRgb,
  type PresetMode,
  type PresetName,
  type PresetTheme,
} from './presets';

/** Canonical WebGL render target — matches `metal.html`'s 300×300 surface. */
const CANONICAL_GL_SIZE = 300;

/** Canonical pill width in CSS px (drives btnDisplay's per-CSS-px ratio). */
export const CANONICAL_PILL_W = 140;
/** Canonical pill height in CSS px. */
export const CANONICAL_PILL_H = 40;

/** Default per-instance source-window divisor for the Button variant (pill).
 *  Matches `index.html`'s `PILL_SHADER_SCALE`. Higher = more zoomed-in. */
export const PILL_SHADER_SCALE = 1.6;
/** Default per-instance source-window divisor for the Circle variant.
 *  Matches `index.html`'s `BOLD_SHADER_SCALE` (legacy name preserved in the
 *  canonical engine for parity, but exported under the Circle name here). */
export const CIRCLE_SHADER_SCALE = 1.3;

/** Shared GL state. Created lazily on the first instance, destroyed when the
 *  last instance unmounts so a long-lived SPA doesn't hold a WebGL slot
 *  forever. */
interface SharedRenderer {
  glCanvas: HTMLCanvasElement;
  gl: WebGLRenderingContext;
  program: WebGLProgram;
  buffer: WebGLBuffer;
  uniforms: Record<string, WebGLUniformLocation | null>;
  preset: PresetMode;
  /** Wallclock origin for `u_time`. */
  startMs: number;
  /** Accumulated paused-time so resume doesn't snap the animation. */
  pausedMs: number;
  pausedAtMs: number | null;
  rafId: number;
  /** DPR captured on last resize. */
  dpr: number;
  instances: Set<MetalFxInstance>;
  /** Frame counter — incremented every successful `renderSharedFrame`. Used by
   *  glow consumers to invalidate cached scans cheaply. */
  frameCount: number;
  /** Timestamp of the last rendered frame — for frame-rate capping. */
  lastFrameMs: number;
}

// (the previous shared GL-fb readback for glow sampling lived here — retired
// in favour of per-instance `getImageData` populated inside
// `copyShaderToInstance`, mirroring index.html's `btnGlowSampleBuf` exactly.)

let SHARED: SharedRenderer | null = null;

function ensureSharedRenderer(): SharedRenderer {
  if (SHARED) return SHARED;

  const dpr = typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1;
  const glCanvas = document.createElement('canvas');
  glCanvas.width = CANONICAL_GL_SIZE * dpr;
  glCanvas.height = CANONICAL_GL_SIZE * dpr;

  const gl =
    (glCanvas.getContext('webgl', {
      alpha: true,
      premultipliedAlpha: false,
      antialias: false,
      // Required so per-instance `drawImage` reads the freshest GL output
      // between RAF ticks — without this, sampling an off-screen GL canvas
      // returns transparent black on most desktop drivers.
      preserveDrawingBuffer: true,
    }) as WebGLRenderingContext | null) ||
    (glCanvas.getContext('experimental-webgl') as WebGLRenderingContext | null);

  if (!gl) {
    throw new Error('metal-fx: WebGL is not supported in this browser');
  }

  gl.enable(gl.BLEND);
  gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

  const vert = compileShader(gl, gl.VERTEX_SHADER, VERT_SHADER_SRC);
  const frag = compileShader(gl, gl.FRAGMENT_SHADER, FRAG_SHADER_SRC);
  const program = linkProgram(gl, vert, frag);
  gl.useProgram(program);

  const buffer = gl.createBuffer();
  if (!buffer) throw new Error('metal-fx: gl.createBuffer returned null');
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
  gl.bufferData(
    gl.ARRAY_BUFFER,
    new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]),
    gl.STATIC_DRAW
  );
  const positionLoc = gl.getAttribLocation(program, 'a_position');
  gl.enableVertexAttribArray(positionLoc);
  gl.vertexAttribPointer(positionLoc, 2, gl.FLOAT, false, 0, 0);

  const uniformNames = [
    'u_resolution', 'u_time',
    'u_color1', 'u_color2', 'u_color3', 'u_color4', 'u_color5', 'u_color6', 'u_color7',
    'u_alpha1', 'u_alpha2', 'u_alpha3', 'u_alpha4', 'u_alpha5', 'u_alpha6', 'u_alpha7',
    'u_intensity', 'u_scale', 'u_direction',
    'u_softness', 'u_distortion', 'u_complexity', 'u_shape',
    'u_vignette', 'u_vigOpacity', 'u_blur', 'u_shaderOpacity',
  ];
  const uniforms: Record<string, WebGLUniformLocation | null> = {};
  for (const name of uniformNames) {
    uniforms[name] = gl.getUniformLocation(program, name);
  }

  SHARED = {
    glCanvas,
    gl,
    program,
    buffer,
    uniforms,
    preset: PRESETS.chromatic.modes.dark,
    startMs: performance.now(),
    pausedMs: 0,
    pausedAtMs: null,
    rafId: 0,
    dpr,
    instances: new Set(),
    frameCount: 0,
    lastFrameMs: 0,
  };
  return SHARED;
}

/** RGB triple in 0..255 range. */
export interface ShaderRGB {
  r: number;
  g: number;
  b: number;
}

const FALLBACK_WHITE: ShaderRGB = { r: 255, g: 255, b: 255 };

// ─── JS-side plasma evaluator (replaces getImageData readback) ─────────────
// Port of the fragment shader's snoise → fbm → computeEffect → palette chain.
// Evaluated at a handful of perimeter points per glow tick (not per pixel).

function mod289(x: number): number {
  return x - Math.floor(x * (1 / 289)) * 289;
}
function permute1(x: number): number {
  return mod289((x * 34 + 1) * x);
}

function snoise(vx: number, vy: number): number {
  const C0 = 0.211324865405187;
  const C1 = 0.366025403784439;
  const C2 = -0.577350269189626;
  const C3 = 0.024390243902439;

  const s = (vx + vy) * C1;
  const ix = Math.floor(vx + s);
  const iy = Math.floor(vy + s);

  const t = (ix + iy) * C0;
  const x0x = vx - ix + t;
  const x0y = vy - iy + t;

  const i1x = x0x > x0y ? 1 : 0;
  const i1y = 1 - i1x;

  const x1x = x0x + C0 - i1x;
  const x1y = x0y + C0 - i1y;
  const x2x = x0x + C2;
  const x2y = x0y + C2;

  const iix = mod289(ix);
  const iiy = mod289(iy);

  const p0 = permute1(permute1(iiy) + iix);
  const p1 = permute1(permute1(iiy + i1y) + iix + i1x);
  const p2 = permute1(permute1(iiy + 1) + iix + 1);

  let m0 = Math.max(0, 0.5 - (x0x * x0x + x0y * x0y));
  let m1 = Math.max(0, 0.5 - (x1x * x1x + x1y * x1y));
  let m2 = Math.max(0, 0.5 - (x2x * x2x + x2y * x2y));
  m0 *= m0; m0 *= m0;
  m1 *= m1; m1 *= m1;
  m2 *= m2; m2 *= m2;

  const x_0 = 2 * ((p0 * C3) % 1) - 1;
  const x_1 = 2 * ((p1 * C3) % 1) - 1;
  const x_2 = 2 * ((p2 * C3) % 1) - 1;

  const h0 = Math.abs(x_0) - 0.5;
  const h1 = Math.abs(x_1) - 0.5;
  const h2 = Math.abs(x_2) - 0.5;

  const ox0 = Math.floor(x_0 + 0.5);
  const ox1 = Math.floor(x_1 + 0.5);
  const ox2 = Math.floor(x_2 + 0.5);

  const a0_0 = x_0 - ox0;
  const a0_1 = x_1 - ox1;
  const a0_2 = x_2 - ox2;

  const corr0 = 1.79284291400159 - 0.85373472095314 * (a0_0 * a0_0 + h0 * h0);
  const corr1 = 1.79284291400159 - 0.85373472095314 * (a0_1 * a0_1 + h1 * h1);
  const corr2 = 1.79284291400159 - 0.85373472095314 * (a0_2 * a0_2 + h2 * h2);

  const g0 = a0_0 * x0x + h0 * x0y;
  const g1 = a0_1 * x1x + h1 * x1y;
  const g2 = a0_2 * x2x + h2 * x2y;

  return 130 * (m0 * corr0 * g0 + m1 * corr1 * g1 + m2 * corr2 * g2);
}

function fbm(px: number, py: number, octaves: number): number {
  let val = 0;
  let amp = 0.5;
  for (let i = 0; i < octaves; i++) {
    val += amp * snoise(px, py);
    px *= 2;
    py *= 2;
    amp *= 0.5;
  }
  return val;
}

function evaluatePlasmaRGB(u: number, v: number): ShaderRGB {
  if (!SHARED) return FALLBACK_WHITE;
  const p = SHARED.preset;
  const now = performance.now();
  const t = ((now - SHARED.startMs - SHARED.pausedMs) / 1000) * p.speed;
  const cpx = p.complexity;
  const octaves = Math.min(4, 3 + Math.floor(cpx * 4));

  let px = (u - 0.5) * p.scale;
  let py = (v - 0.5) * p.scale;

  const dirRad = (p.direction * Math.PI) / 180;
  px += Math.cos(dirRad) * t * 0.15;
  py += Math.sin(dirRad) * t * 0.15;

  const freq = 3 + cpx * 8;
  const len = Math.sqrt(px * px + py * py);
  let val = 0;
  val += Math.sin(px * freq + t);
  val += Math.sin(py * freq + t * 1.3);
  val += Math.sin((px + py) * freq * 0.7 + t * 0.7);
  val += Math.sin(len * freq * 0.8 - t * 1.5);

  const warpStr = p.distortion * 2;
  const w0 = fbm(px + t * 0.1, py, octaves);
  const w1 = fbm(px + 5, py + t * 0.12 + 5, octaves);
  val += (w0 + w1) * warpStr * p.distortion;
  val = val * 0.2 * p.intensity + 0.5;
  val = Math.max(0, Math.min(1, val));

  const st = val * val * (3 - 2 * val);
  const k = 64;
  const w1p = p.alphas[0] * Math.exp(-k * st * st);
  const w2p = p.alphas[1] * Math.exp(-k * (st - 0.25) * (st - 0.25));
  const w3p = p.alphas[2] * Math.exp(-k * (st - 0.5) * (st - 0.5));
  const w4p = p.alphas[3] * Math.exp(-k * (st - 0.75) * (st - 0.75));
  const w5p = p.alphas[4] * Math.exp(-k * (st - 1.0) * (st - 1.0));
  const wTotal = w1p + w2p + w3p + w4p + w5p + 0.0001;

  const colors = p.colors.map(hexToRgb);
  const rr =
    (colors[0][0] * w1p + colors[1][0] * w2p + colors[2][0] * w3p +
     colors[3][0] * w4p + colors[4][0] * w5p) / wTotal;
  const gg =
    (colors[0][1] * w1p + colors[1][1] * w2p + colors[2][1] * w3p +
     colors[3][1] * w4p + colors[4][1] * w5p) / wTotal;
  const bb =
    (colors[0][2] * w1p + colors[1][2] * w2p + colors[2][2] * w3p +
     colors[3][2] * w4p + colors[4][2] * w5p) / wTotal;

  const gamma = 1.3;
  return {
    r: Math.pow(Math.max(0, Math.min(1, rr)), gamma) * 255,
    g: Math.pow(Math.max(0, Math.min(1, gg)), gamma) * 255,
    b: Math.pow(Math.max(0, Math.min(1, bb)), gamma) * 255,
  };
}

/** Map instance-canvas DPR-pixel coordinates to shader UV [0,1]. */
function canvasPixelToUV(inst: MetalFxInstance, px: number, py: number): { u: number; v: number } {
  const dpr = inst.dpr;
  const dw = inst.cssWidth * dpr;
  const dh = inst.cssHeight * dpr;
  const cw = CANONICAL_GL_SIZE * dpr;
  const ch = cw;
  const bdW = CANONICAL_PILL_W * dpr;
  const bdH = CANONICAL_PILL_H * dpr;
  let srcW = (dw * cw) / (bdW * inst.shaderScale);
  let srcH = (dh * ch) / (bdH * inst.shaderScale);
  if (srcW > cw) srcW = cw;
  if (srcH > ch) srcH = ch;
  const sx = (cw - srcW) / 2;
  const sy = (ch - srcH) / 2;
  return {
    u: (sx + (px / dw) * srcW) / cw,
    v: 1 - (sy + (py / dh) * srcH) / ch,
  };
}

/** Sample shader luminance at instance-canvas pixel `(x, y)` (DPR-aware).
 *  Direct port of `_btnGlowLumAt` (index.html L5316) — reads from the
 *  per-instance 2D-canvas bitmap captured BEFORE the centre punch, using
 *  Rec.709 luminance weights (0.2126 R + 0.7152 G + 0.0722 B). The buffer
 *  is in the SAME coordinate system as the perimeter sample table (DPR-
 *  space pixels on the visible button), so no GL-fb crop math is needed:
 *  the (x,y) caller passes are direct buffer indices.
 *
 *  Returns 0..1 luminance, or 0 when no buffer is available yet (first
 *  frame, paused, or `getImageData` failure). */
export function sampleShaderLumAt(
  inst: MetalFxInstance,
  x: number,
  y: number,
  radius: number
): number {
  const buf = inst.glowSampleBuf;
  if (!buf) return 0;
  const W = inst.glowSampleW;
  const H = inst.glowSampleH;
  const cx = Math.round(x);
  const cy = Math.round(y);
  const r = Math.max(1, radius | 0);
  const x0 = Math.max(0, cx - r);
  const x1 = Math.min(W, cx + r + 1);
  const y0 = Math.max(0, cy - r);
  const y1 = Math.min(H, cy + r + 1);
  let sum = 0;
  let count = 0;
  for (let py = y0; py < y1; py++) {
    const rowBase = py * W;
    for (let px = x0; px < x1; px++) {
      const i = (rowBase + px) * 4;
      sum += (0.2126 * buf[i] + 0.7152 * buf[i + 1] + 0.0722 * buf[i + 2]) / 255;
      count++;
    }
  }
  return count > 0 ? sum / count : 0;
}

/** Average shader RGB at instance-canvas pixel `(x, y)` over a `radius`
 *  window. Direct port of `_btnGlowRGBAt` (index.html L5259). Used in dark
 *  mode to drive the halo's per-frame tint toward the local shader hue. */
export function sampleShaderRGBAt(
  inst: MetalFxInstance,
  x: number,
  y: number,
  radius: number
): ShaderRGB {
  const buf = inst.glowSampleBuf;
  if (!buf) return FALLBACK_WHITE;
  const W = inst.glowSampleW;
  const H = inst.glowSampleH;
  const cx = Math.round(x);
  const cy = Math.round(y);
  const r = Math.max(1, radius | 0);
  const x0 = Math.max(0, cx - r);
  const x1 = Math.min(W, cx + r + 1);
  const y0 = Math.max(0, cy - r);
  const y1 = Math.min(H, cy + r + 1);
  let sR = 0, sG = 0, sB = 0, count = 0;
  for (let py = y0; py < y1; py++) {
    const rowBase = py * W;
    for (let px = x0; px < x1; px++) {
      const i = (rowBase + px) * 4;
      sR += buf[i];
      sG += buf[i + 1];
      sB += buf[i + 2];
      count++;
    }
  }
  if (count === 0) return FALLBACK_WHITE;
  return { r: sR / count, g: sG / count, b: sB / count };
}

/** Pick the most chromatic pixel in the window — preserves shader hue when
 *  averaging would collapse to neutral grey. Direct port of
 *  `_btnGlowRGBAtMostChromatic` (index.html L5286). */
export function sampleShaderRGBChromatic(
  inst: MetalFxInstance,
  x: number,
  y: number,
  radius: number
): ShaderRGB {
  const buf = inst.glowSampleBuf;
  if (!buf) return FALLBACK_WHITE;
  const W = inst.glowSampleW;
  const H = inst.glowSampleH;
  const cx = Math.round(x);
  const cy = Math.round(y);
  const r = Math.max(1, radius | 0);
  const x0 = Math.max(0, cx - r);
  const x1 = Math.min(W, cx + r + 1);
  const y0 = Math.max(0, cy - r);
  const y1 = Math.min(H, cy + r + 1);
  let bestR = 255, bestG = 255, bestB = 255, bestScore = -1;
  for (let py = y0; py < y1; py++) {
    const rowBase = py * W;
    for (let px = x0; px < x1; px++) {
      const i = (rowBase + px) * 4;
      const rr = buf[i];
      const gg = buf[i + 1];
      const bb = buf[i + 2];
      const maxC = Math.max(rr, gg, bb);
      const minC = Math.min(rr, gg, bb);
      const sat = maxC > 0 ? (maxC - minC) / maxC : 0;
      const val = maxC / 255;
      const score = sat * (0.35 + 0.65 * val);
      if (score > bestScore) {
        bestScore = score;
        bestR = rr;
        bestG = gg;
        bestB = bb;
      }
    }
  }
  return { r: bestR, g: bestG, b: bestB };
}

/** Per-instance state owned by one mounted `<MetalFx>`. */
export interface MetalFxInstance {
  /** Visible 2D canvas painted each frame. */
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  /** Host CSS dimensions — drives both canvas size and source crop. */
  cssWidth: number;
  cssHeight: number;
  /** Border radius (CSS px) of the host. Used by the punch mask. */
  cornerRadius: number;
  /** Variant kind: pill or circle. */
  kind: 'pill' | 'circle';
  /** When true the punch mask leaves a 2-px ring (circles need it to survive
   *  sub-pixel anti-aliasing on curved silhouettes). When false (pills),
   *  it leaves a 1-px ring. */
  ringCssPx: number;
  /** Per-instance source-window divisor — see `PILL_SHADER_SCALE`. */
  shaderScale: number;
  /** Per-instance opacity multiplier (0..1). Strength prop. */
  opacityMul: number;
  /** Whether to skip the per-frame copy when offscreen. */
  visible: boolean;
  dpr: number;
  /** Optional callback fired after each per-frame paint. */
  onAfterFrame?: () => void;
  /** RGBA bitmap of the visible 2D canvas BEFORE the centre punch — populated
   *  every frame by `copyShaderToInstance` via `getImageData`. The glow
   *  brightness scan + tint sampler read from this buffer using simple
   *  linear coords (DPR-space x,y → buffer index = (y*W+x)*4), exactly
   *  mirroring `btnGlowSampleBuf` from index.html L7654. */
  glowSampleBuf: Uint8ClampedArray | null;
  glowSampleW: number;
  glowSampleH: number;
}

interface CreateInstanceOptions {
  hostCanvas: HTMLCanvasElement;
  cssWidth: number;
  cssHeight: number;
  cornerRadius: number;
  kind: 'pill' | 'circle';
  shaderScale?: number;
  ringCssPx?: number;
  opacityMul?: number;
  onAfterFrame?: () => void;
}

export function createInstance(opts: CreateInstanceOptions): MetalFxInstance {
  const renderer = ensureSharedRenderer();
  const ctx = opts.hostCanvas.getContext('2d', { alpha: true });
  if (!ctx) throw new Error('metal-fx: failed to acquire 2D context');

  const inst: MetalFxInstance = {
    canvas: opts.hostCanvas,
    ctx,
    cssWidth: opts.cssWidth,
    cssHeight: opts.cssHeight,
    cornerRadius: opts.cornerRadius,
    kind: opts.kind,
    ringCssPx: opts.ringCssPx ?? (opts.kind === 'circle' ? 2 : 1),
    shaderScale:
      opts.shaderScale ??
      (opts.kind === 'circle' ? CIRCLE_SHADER_SCALE : PILL_SHADER_SCALE),
    opacityMul: opts.opacityMul ?? 1,
    visible: true,
    dpr: typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1,
    onAfterFrame: opts.onAfterFrame,
    glowSampleBuf: null,
    glowSampleW: 0,
    glowSampleH: 0,
  };

  resizeInstanceCanvas(inst);
  renderer.instances.add(inst);

  if (renderer.rafId === 0 && renderer.pausedAtMs === null) {
    startSharedLoop();
  }
  return inst;
}

export function destroyInstance(inst: MetalFxInstance): void {
  if (!SHARED) return;
  SHARED.instances.delete(inst);
  if (SHARED.instances.size === 0) {
    stopSharedLoop();
    teardownSharedRenderer();
  }
}

export function updateInstance(
  inst: MetalFxInstance,
  patch: Partial<{
    cssWidth: number;
    cssHeight: number;
    cornerRadius: number;
    kind: 'pill' | 'circle';
    shaderScale: number;
    ringCssPx: number;
    opacityMul: number;
  }>
): void {
  let sizeDirty = false;
  let maskDirty = false;
  if (patch.cssWidth !== undefined && patch.cssWidth !== inst.cssWidth) {
    inst.cssWidth = patch.cssWidth;
    sizeDirty = true;
  }
  if (patch.cssHeight !== undefined && patch.cssHeight !== inst.cssHeight) {
    inst.cssHeight = patch.cssHeight;
    sizeDirty = true;
  }
  if (patch.cornerRadius !== undefined && patch.cornerRadius !== inst.cornerRadius) {
    inst.cornerRadius = patch.cornerRadius;
    maskDirty = true;
  }
  if (patch.kind !== undefined && patch.kind !== inst.kind) {
    inst.kind = patch.kind;
    if (patch.shaderScale === undefined) {
      inst.shaderScale =
        patch.kind === 'circle' ? CIRCLE_SHADER_SCALE : PILL_SHADER_SCALE;
    }
    if (patch.ringCssPx === undefined) {
      inst.ringCssPx = patch.kind === 'circle' ? 2 : 1;
      maskDirty = true;
    }
  }
  if (patch.shaderScale !== undefined) inst.shaderScale = patch.shaderScale;
  if (patch.ringCssPx !== undefined && patch.ringCssPx !== inst.ringCssPx) {
    inst.ringCssPx = patch.ringCssPx;
    maskDirty = true;
  }
  if (patch.opacityMul !== undefined) inst.opacityMul = patch.opacityMul;
  if (sizeDirty) resizeInstanceCanvas(inst);
  else if (maskDirty) applyRingMask(inst);
}

export function setInstanceVisible(inst: MetalFxInstance, visible: boolean): void {
  inst.visible = visible;
}

export function setSharedPreset(name: PresetName, theme: PresetTheme): void {
  const renderer = ensureSharedRenderer();
  renderer.preset = PRESETS[name].modes[theme];
}

export function pauseShared(): void {
  if (!SHARED || SHARED.pausedAtMs !== null) return;
  SHARED.pausedAtMs = performance.now();
  stopSharedLoop();
}

export function resumeShared(): void {
  if (!SHARED || SHARED.pausedAtMs === null) return;
  const now = performance.now();
  SHARED.pausedMs += now - SHARED.pausedAtMs;
  SHARED.pausedAtMs = null;
  if (SHARED.instances.size > 0) startSharedLoop();
}

/** Resize the per-instance canvas to current CSS size × DPR. */
function resizeInstanceCanvas(inst: MetalFxInstance): void {
  inst.dpr = typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1;
  const w = Math.max(1, Math.round(inst.cssWidth * inst.dpr));
  const h = Math.max(1, Math.round(inst.cssHeight * inst.dpr));
  if (inst.canvas.width !== w) inst.canvas.width = w;
  if (inst.canvas.height !== h) inst.canvas.height = h;
  applyRingMask(inst);
}

/** SVG rounded-rect path command string. */
function svgRRect(x: number, y: number, w: number, h: number, r: number): string {
  const rr = Math.max(0, Math.min(r, w / 2, h / 2));
  if (rr < 0.01) return `M${x},${y}h${w}v${h}h${-w}Z`;
  return (
    `M${x + rr},${y}` +
    `h${w - 2 * rr}` +
    `a${rr},${rr} 0 0 1 ${rr},${rr}` +
    `v${h - 2 * rr}` +
    `a${rr},${rr} 0 0 1 ${-rr},${rr}` +
    `h${-(w - 2 * rr)}` +
    `a${rr},${rr} 0 0 1 ${-rr},${-rr}` +
    `v${-(h - 2 * rr)}` +
    `a${rr},${rr} 0 0 1 ${rr},${-rr}Z`
  );
}

/** Apply an even-odd SVG ring mask via CSS so the compositor punches the
 *  inner hole on the GPU. The canvas buffer stays unpunched — glow sampling
 *  reads it directly. Updated on resize / radius change, zero per-frame cost. */
function applyRingMask(inst: MetalFxInstance): void {
  const w = inst.cssWidth;
  const h = inst.cssHeight;
  const r = inst.cornerRadius;
  const s = inst.ringCssPx;
  const innerR = Math.max(0, r - s);
  const outer = svgRRect(0, 0, w, h, r);
  const inner = svgRRect(s, s, w - 2 * s, h - 2 * s, innerR);
  const svg =
    `<svg xmlns='http://www.w3.org/2000/svg' width='${w}' height='${h}'>` +
    `<path fill-rule='evenodd' d='${outer} ${inner}' fill='white'/>` +
    `</svg>`;
  const url = `url("data:image/svg+xml,${encodeURIComponent(svg)}")`;
  inst.canvas.style.maskImage = url;
  inst.canvas.style.webkitMaskImage = url;
  inst.canvas.style.maskSize = '100% 100%';
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (inst.canvas.style as any).webkitMaskSize = '100% 100%';
}

/** Per-frame copy from the shared GL canvas into an instance's 2D canvas.
 *  Source crop math reproduces `copyShaderToAux` from the canonical engine
 *  exactly: pick the same per-CSS-pixel ratio as the canonical 140×40
 *  `btnDisplay` (so 1 CSS px on this aux samples the same shader region as
 *  1 CSS px on the canonical pill), then divide by `shaderScale` to zoom
 *  features for smaller hosts (circle) or to taste (Button variant). */
function copyShaderToInstance(inst: MetalFxInstance): void {
  if (!SHARED) return;
  const renderer = SHARED;
  const dpr = inst.dpr;
  const dw = inst.canvas.width;
  const dh = inst.canvas.height;
  if (dw < 1 || dh < 1) return;

  const cw = renderer.glCanvas.width;
  const ch = renderer.glCanvas.height;
  const bdW = CANONICAL_PILL_W * dpr;
  const bdH = CANONICAL_PILL_H * dpr;
  const sxRatio = cw / bdW;
  const syRatio = ch / bdH;
  let srcW = (dw * sxRatio) / inst.shaderScale;
  let srcH = (dh * syRatio) / inst.shaderScale;
  if (srcW > cw) srcW = cw;
  if (srcH > ch) srcH = ch;
  const sx = Math.max(0, (cw - srcW) / 2);
  const sy = Math.max(0, (ch - srcH) / 2);

  inst.ctx.clearRect(0, 0, dw, dh);
  if (inst.opacityMul < 1) inst.ctx.globalAlpha = inst.opacityMul;
  inst.ctx.drawImage(renderer.glCanvas, sx, sy, srcW, srcH, 0, 0, dw, dh);
  if (inst.opacityMul < 1) inst.ctx.globalAlpha = 1;

  // The ring mask is handled by CSS mask-image (applied in applyRingMask),
  // so the canvas buffer stays unpunched. The glow's brightness scan reads
  // from this buffer directly — getImageData is deferred to the glow tick
  // (see glow-luminance optimisation).
  try {
    const img = inst.ctx.getImageData(0, 0, dw, dh);
    inst.glowSampleBuf = img.data;
    inst.glowSampleW = dw;
    inst.glowSampleH = dh;
  } catch {
    // Cross-origin canvas tainting — leave the buffer as-is.
  }

  inst.onAfterFrame?.();
}

/** Single GL render pass — uploads uniforms from the active preset. */
function renderSharedFrame(now: number): void {
  if (!SHARED) return;
  const { gl, uniforms, preset } = SHARED;
  const t = ((now - SHARED.startMs - SHARED.pausedMs) / 1000) * preset.speed;

  gl.viewport(0, 0, SHARED.glCanvas.width, SHARED.glCanvas.height);
  gl.clearColor(0, 0, 0, 0);
  gl.clear(gl.COLOR_BUFFER_BIT);

  if (uniforms.u_resolution)
    gl.uniform2f(uniforms.u_resolution, SHARED.glCanvas.width, SHARED.glCanvas.height);
  if (uniforms.u_time) gl.uniform1f(uniforms.u_time, t);

  for (let i = 0; i < 7; i++) {
    const colorLoc = uniforms[`u_color${i + 1}`];
    if (colorLoc) {
      const [r, g, b] = hexToRgb(preset.colors[i]);
      gl.uniform3f(colorLoc, r, g, b);
    }
    const alphaLoc = uniforms[`u_alpha${i + 1}`];
    if (alphaLoc) gl.uniform1f(alphaLoc, preset.alphas[i]);
  }
  if (uniforms.u_intensity) gl.uniform1f(uniforms.u_intensity, preset.intensity);
  if (uniforms.u_scale) gl.uniform1f(uniforms.u_scale, preset.scale);
  if (uniforms.u_direction)
    gl.uniform1f(uniforms.u_direction, (preset.direction * Math.PI) / 180);
  if (uniforms.u_softness) gl.uniform1f(uniforms.u_softness, preset.softness);
  if (uniforms.u_distortion) gl.uniform1f(uniforms.u_distortion, preset.distortion);
  if (uniforms.u_complexity) gl.uniform1f(uniforms.u_complexity, preset.complexity);
  if (uniforms.u_shape) gl.uniform1f(uniforms.u_shape, preset.shape);
  if (uniforms.u_vignette) gl.uniform1f(uniforms.u_vignette, preset.vignette);
  if (uniforms.u_vigOpacity) gl.uniform1f(uniforms.u_vigOpacity, preset.vigOpacity);
  if (uniforms.u_blur) gl.uniform1f(uniforms.u_blur, preset.blur);
  if (uniforms.u_shaderOpacity)
    gl.uniform1f(uniforms.u_shaderOpacity, preset.shaderOpacity);

  gl.drawArrays(gl.TRIANGLES, 0, 6);

  // Glow brightness scans no longer use a shared GL framebuffer readback —
  // each instance captures its own visible 2D-canvas bitmap via
  // `getImageData` inside `copyShaderToInstance` (mirroring the canonical
  // engine's `btnGlowSampleBuf` from index.html L7654). That removes the
  // `gl.readPixels(0, 0, 300×dpr, 300×dpr, RGBA, UNSIGNED_BYTE, …)` cost
  // (~360 KB readback per frame at default DPR) AND fixes the brightness-
  // anchor / tint sampler — which were reading the wrong region of the
  // raw GL canvas because the centred sub-rect crop applied during
  // `drawImage` was never inverted in the sampler.
  SHARED.frameCount++;
}

/** Minimum ms between rendered frames — 33 ms ≈ 30 fps. The plasma animation
 *  is slow noise blobs; 30 fps is visually identical to 120 fps and cuts main-
 *  thread cost by 75 % on ProMotion displays. */
const FRAME_INTERVAL_MS = 33;

function tick(now: number): void {
  if (!SHARED) return;
  SHARED.rafId = requestAnimationFrame(tick);

  if (now - SHARED.lastFrameMs < FRAME_INTERVAL_MS) return;
  SHARED.lastFrameMs = now;

  let anyVisible = false;
  for (const inst of SHARED.instances) {
    if (inst.visible) {
      anyVisible = true;
      break;
    }
  }
  if (anyVisible) {
    renderSharedFrame(now);
    for (const inst of SHARED.instances) {
      if (inst.visible) copyShaderToInstance(inst);
    }
  }
}

function startSharedLoop(): void {
  if (!SHARED || SHARED.rafId !== 0) return;
  SHARED.rafId = requestAnimationFrame(tick);
}

function stopSharedLoop(): void {
  if (!SHARED) return;
  if (SHARED.rafId !== 0) cancelAnimationFrame(SHARED.rafId);
  SHARED.rafId = 0;
}

function teardownSharedRenderer(): void {
  if (!SHARED) return;
  const { gl, program, buffer } = SHARED;
  try {
    gl.deleteBuffer(buffer);
    gl.deleteProgram(program);
    const lose = gl.getExtension('WEBGL_lose_context');
    if (lose && typeof lose.loseContext === 'function') lose.loseContext();
  } catch {
    /* swallow */
  }
  SHARED = null;
}

/** Read accessor for the shared frame counter — glow consumers cache scans
 *  and invalidate when the counter changes. */
export function getSharedFrameCount(): number {
  return SHARED?.frameCount ?? 0;
}
