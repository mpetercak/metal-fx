/**
 * Shared WebGL renderer — one offscreen GL canvas drives all MetalFx instances.
 *
 * Architecture:
 *   1. A single offscreen GL canvas renders the plasma shader.
 *   2. Each instance owns a visible 2D canvas that receives a cropped/scaled
 *      copy of the GL output with an inner "hole punch" mask (ring effect).
 *   3. Glow sampling reads from a shared pixel buffer (gl.readPixels) that is
 *      refreshed at most every 200ms to avoid GPU pipeline flushes on every frame.
 *   4. The animation loop is capped at ~30fps — the blur + slow plasma motion
 *      makes higher rates imperceptible.
 */
import { hexToRgb, PRESETS, type PresetMode, type PresetName, type PresetTheme } from './presets';
import { compileShader, FRAG_SHADER_SRC, linkProgram, VERT_SHADER_SRC } from './shaders';

/** GL canvas CSS-px base size. Actual device pixels = this × devicePixelRatio.
 *  Kept small since the output is blurred and drawn into small instance canvases. */
const CANONICAL_GL_SIZE = 150;
/** Reference pill dimensions used to compute per-instance crop scaling. */
export const CANONICAL_PILL_W = 140;
export const CANONICAL_PILL_H = 40;
/** How much of the GL canvas each shape variant "zooms into". Larger = tighter crop. */
export const PILL_SHADER_SCALE = 1.6;
export const CIRCLE_SHADER_SCALE = 1.3;

export interface ShaderRGB { r: number; g: number; b: number }

/** Per-component rendering state. Each instance is a visible canvas + metadata. */
export interface MetalFxInstance {
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  cssWidth: number;
  cssHeight: number;
  cornerRadius: number;
  kind: 'pill' | 'circle';
  /** Visible ring thickness in CSS px (the border that remains after hole-punch). */
  ringCssPx: number;
  /** Crop zoom factor — how much of the shared GL canvas this instance uses. */
  shaderScale: number;
  /** Optional global opacity multiplier (e.g. for fade-in transitions). */
  opacityMul: number;
  visible: boolean;
  dpr: number;
  onAfterFrame?: () => void;
}

/** Size of the square region read back from the GL canvas for glow luminance sampling. */
const GLOW_READ_SIZE = 150;

interface SharedRenderer {
  glCanvas: HTMLCanvasElement;
  gl: WebGLRenderingContext;
  program: WebGLProgram;
  buffer: WebGLBuffer;
  uniforms: Record<string, WebGLUniformLocation | null>;
  preset: PresetMode;
  presetDirty: boolean;
  startMs: number;
  pausedMs: number;
  pausedAtMs: number | null;
  rafId: number;
  dpr: number;
  instances: Set<MetalFxInstance>;
  frameCount: number;
  glowQueue: MetalFxInstance[];
  glowIdx: number;
  glowPixels: Uint8Array;
  glowPixelsW: number;
  glowPixelsH: number;
}

let SHARED: SharedRenderer | null = null;

function ensureSharedRenderer(): SharedRenderer {
  if (SHARED) return SHARED;

  const dpr = typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1;
  const glCanvas = document.createElement('canvas');
  glCanvas.width = CANONICAL_GL_SIZE * dpr;
  glCanvas.height = CANONICAL_GL_SIZE * dpr;

  const gl = (glCanvas.getContext('webgl', {
    alpha: true, premultipliedAlpha: false, antialias: false, preserveDrawingBuffer: true,
  }) ?? glCanvas.getContext('experimental-webgl')) as WebGLRenderingContext | null;
  if (!gl) throw new Error('metal-fx: WebGL not supported');

  gl.enable(gl.BLEND);
  gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

  const vert = compileShader(gl, gl.VERTEX_SHADER, VERT_SHADER_SRC);
  const frag = compileShader(gl, gl.FRAGMENT_SHADER, FRAG_SHADER_SRC);
  const program = linkProgram(gl, vert, frag);
  // biome-ignore lint/correctness/useHookAtTopLevel: WebGL method, not a React hook
  gl.useProgram(program);

  const buffer = gl.createBuffer();
  if (!buffer) throw new Error('metal-fx: gl.createBuffer returned null');
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]), gl.STATIC_DRAW);
  const posLoc = gl.getAttribLocation(program, 'a_position');
  gl.enableVertexAttribArray(posLoc);
  gl.vertexAttribPointer(posLoc, 2, gl.FLOAT, false, 0, 0);

  const uNames = [
    'u_resolution', 'u_time',
    'u_color1', 'u_color2', 'u_color3', 'u_color4', 'u_color5', 'u_color6', 'u_color7',
    'u_alpha1', 'u_alpha2', 'u_alpha3', 'u_alpha4', 'u_alpha5', 'u_alpha6', 'u_alpha7',
    'u_intensity', 'u_scale', 'u_direction', 'u_softness',
    'u_distortion', 'u_complexity', 'u_shape',
    'u_vignette', 'u_vigOpacity', 'u_blur', 'u_shaderOpacity',
  ];
  const uniforms: Record<string, WebGLUniformLocation | null> = {};
  for (const n of uNames) uniforms[n] = gl.getUniformLocation(program, n);

  SHARED = {
    glCanvas, gl, program, buffer, uniforms,
    preset: PRESETS.chromatic.modes.dark, presetDirty: true,
    startMs: performance.now(), pausedMs: 0, pausedAtMs: null,
    rafId: 0, dpr, instances: new Set(), frameCount: 0,
    glowQueue: [], glowIdx: 0,
    glowPixels: new Uint8Array(GLOW_READ_SIZE * GLOW_READ_SIZE * 4),
    glowPixelsW: GLOW_READ_SIZE, glowPixelsH: GLOW_READ_SIZE,
  };
  return SHARED;
}

// ─── Sampling ─────────────────────────────────────────────────────────────
// All glow luminance/color sampling reads from a shared pixel buffer
// (SHARED.glowPixels). The buffer is refreshed via gl.readPixels at most
// every GLOW_READBACK_INTERVAL_MS to avoid the expensive GPU→CPU pipeline
// flush on every frame. The plasma shader evolves slowly so 200ms-stale
// data is visually indistinguishable.

const GLOW_READBACK_INTERVAL_MS = 300;
let _lastReadbackMs = 0;
/** Lazily refresh the shared pixel buffer if the cooldown has elapsed. */
function ensureGlowPixels(): void {
  if (!SHARED) return;
  const now = performance.now();
  if (now - _lastReadbackMs < GLOW_READBACK_INTERVAL_MS) return;
  _lastReadbackMs = now;
  const { gl, glCanvas } = SHARED;
  const cw = glCanvas.width, ch = glCanvas.height;
  const rw = Math.min(GLOW_READ_SIZE, cw);
  const rh = Math.min(GLOW_READ_SIZE, ch);
  if (SHARED.glowPixelsW !== rw || SHARED.glowPixelsH !== rh) {
    SHARED.glowPixelsW = rw;
    SHARED.glowPixelsH = rh;
    SHARED.glowPixels = new Uint8Array(rw * rh * 4);
  }
  const ox = Math.max(0, Math.floor((cw - rw) / 2));
  const oy = Math.max(0, Math.floor((ch - rh) / 2));
  gl.readPixels(ox, oy, rw, rh, gl.RGBA, gl.UNSIGNED_BYTE, SHARED.glowPixels);
}

/**
 * Map per-instance CSS-px glow coordinates to the shared GL pixel buffer.
 *
 * The GL canvas is shared across all instances. Each instance "sees" a
 * different crop of it (computed identically to copyShaderToInstance).
 * This function reverses that mapping: given a CSS-px coordinate on the
 * instance, it returns the (bx, by) index into SHARED.glowPixels.
 *
 * readPixels stores rows bottom-up (GL convention) so Y is flipped.
 */
function mapToGlowBuf(inst: MetalFxInstance, cssPxX: number, cssPxY: number): { bx: number; by: number } {
  if (!SHARED) return { bx: 0, by: 0 };
  const { glCanvas, glowPixelsW: rw, glowPixelsH: rh } = SHARED;
  const cw = glCanvas.width, ch = glCanvas.height;
  const dpr = inst.dpr;
  const dw = inst.cssWidth * dpr, dh = inst.cssHeight * dpr;
  const bdW = CANONICAL_PILL_W * dpr, bdH = CANONICAL_PILL_H * dpr;
  let srcW = (dw * (cw / bdW)) / inst.shaderScale;
  let srcH = (dh * (ch / bdH)) / inst.shaderScale;
  if (srcW > cw) srcW = cw;
  if (srcH > ch) srcH = ch;
  const sx = (cw - srcW) / 2;
  const sy = (ch - srcH) / 2;
  const glX = sx + (cssPxX / inst.cssWidth) * srcW;
  const glY = sy + (cssPxY / inst.cssHeight) * srcH;
  const ox = Math.max(0, Math.floor((cw - rw) / 2));
  const oy = Math.max(0, Math.floor((ch - rh) / 2));
  const bx = Math.round(glX - ox);
  const by = Math.round((ch - 1 - glY) - oy);
  return { bx, by };
}

/** Average RGBA and luminance in a square region of the pixel buffer. */
function sampleRegion(
  buf: Uint8Array, W: number, H: number,
  bx: number, by: number, radius: number
): { r: number; g: number; b: number; lum: number; count: number } {
  const r = Math.max(1, radius | 0);
  const x0 = Math.max(0, bx - r), x1 = Math.min(W, bx + r + 1);
  const y0 = Math.max(0, by - r), y1 = Math.min(H, by + r + 1);
  let sR = 0, sG = 0, sB = 0, sLum = 0, count = 0;
  for (let py = y0; py < y1; py++) {
    const row = py * W;
    for (let px = x0; px < x1; px++) {
      const i = (row + px) * 4;
      sR += buf[i]; sG += buf[i + 1]; sB += buf[i + 2];
      sLum += (0.2126 * buf[i] + 0.7152 * buf[i + 1] + 0.0722 * buf[i + 2]) / 255;
      count++;
    }
  }
  return { r: sR, g: sG, b: sB, lum: sLum, count };
}

export function sampleShaderLumAt(inst: MetalFxInstance, cssPxX: number, cssPxY: number, radius: number): number {
  if (!SHARED) return 0;
  ensureGlowPixels();
  const { bx, by } = mapToGlowBuf(inst, cssPxX, cssPxY);
  const s = sampleRegion(SHARED.glowPixels, SHARED.glowPixelsW, SHARED.glowPixelsH, bx, by, radius);
  return s.count > 0 ? s.lum / s.count : 0;
}

export function sampleShaderRGBAt(inst: MetalFxInstance, cssPxX: number, cssPxY: number, radius: number): ShaderRGB {
  if (!SHARED) return { r: 255, g: 255, b: 255 };
  ensureGlowPixels();
  const { bx, by } = mapToGlowBuf(inst, cssPxX, cssPxY);
  const s = sampleRegion(SHARED.glowPixels, SHARED.glowPixelsW, SHARED.glowPixelsH, bx, by, radius);
  if (s.count === 0) return { r: 255, g: 255, b: 255 };
  return { r: s.r / s.count, g: s.g / s.count, b: s.b / s.count };
}

/** Like sampleShaderRGBAt but returns the most saturated pixel (for light-mode tinting). */
export function sampleShaderRGBChromatic(inst: MetalFxInstance, cssPxX: number, cssPxY: number, radius: number): ShaderRGB {
  if (!SHARED) return { r: 255, g: 255, b: 255 };
  ensureGlowPixels();
  const { bx, by } = mapToGlowBuf(inst, cssPxX, cssPxY);
  const { glowPixels: buf, glowPixelsW: W, glowPixelsH: H } = SHARED;
  const r = Math.max(1, radius | 0);
  const x0 = Math.max(0, bx - r), x1 = Math.min(W, bx + r + 1);
  const y0 = Math.max(0, by - r), y1 = Math.min(H, by + r + 1);
  let bestR = 255, bestG = 255, bestB = 255, bestScore = -1;
  for (let py = y0; py < y1; py++) {
    const row = py * W;
    for (let px = x0; px < x1; px++) {
      const i = (row + px) * 4;
      const rr = buf[i], gg = buf[i + 1], bb = buf[i + 2];
      const maxC = Math.max(rr, gg, bb), minC = Math.min(rr, gg, bb);
      const sat = maxC > 0 ? (maxC - minC) / maxC : 0;
      const score = sat * (0.35 + 0.65 * (maxC / 255));
      if (score > bestScore) { bestScore = score; bestR = rr; bestG = gg; bestB = bb; }
    }
  }
  return { r: bestR, g: bestG, b: bestB };
}

// ─── Instance lifecycle ───────────────────────────────────────────────────

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
  if (!ctx) throw new Error('metal-fx: canvas 2D context unavailable');

  const inst: MetalFxInstance = {
    canvas: opts.hostCanvas, ctx,
    cssWidth: opts.cssWidth, cssHeight: opts.cssHeight,
    cornerRadius: opts.cornerRadius,
    kind: opts.kind,
    ringCssPx: opts.ringCssPx ?? (opts.kind === 'circle' ? 2 : 1),
    shaderScale: opts.shaderScale ?? (opts.kind === 'circle' ? CIRCLE_SHADER_SCALE : PILL_SHADER_SCALE),
    opacityMul: opts.opacityMul ?? 1,
    visible: true,
    dpr: typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1,
    onAfterFrame: opts.onAfterFrame,
  };
  resizeInstanceCanvas(inst);
  renderer.instances.add(inst);
  if (renderer.rafId === 0 && renderer.pausedAtMs === null) startSharedLoop();
  return inst;
}

export function destroyInstance(inst: MetalFxInstance): void {
  if (!SHARED) return;
  SHARED.instances.delete(inst);
  const qi = SHARED.glowQueue.indexOf(inst);
  if (qi !== -1) SHARED.glowQueue.splice(qi, 1);
  if (SHARED.instances.size === 0) { stopSharedLoop(); teardownSharedRenderer(); }
}

export function registerGlowInstance(inst: MetalFxInstance): void {
  if (!SHARED) return;
  if (!SHARED.glowQueue.includes(inst)) SHARED.glowQueue.push(inst);
}

export function unregisterGlowInstance(inst: MetalFxInstance): void {
  if (!SHARED) return;
  const i = SHARED.glowQueue.indexOf(inst);
  if (i !== -1) SHARED.glowQueue.splice(i, 1);
}

export function updateInstance(
  inst: MetalFxInstance,
  patch: Partial<Pick<MetalFxInstance, 'cssWidth' | 'cssHeight' | 'cornerRadius' | 'kind' | 'shaderScale' | 'ringCssPx' | 'opacityMul'>>
): void {
  let dirty = false;
  if (patch.cssWidth !== undefined && patch.cssWidth !== inst.cssWidth) { inst.cssWidth = patch.cssWidth; dirty = true; }
  if (patch.cssHeight !== undefined && patch.cssHeight !== inst.cssHeight) { inst.cssHeight = patch.cssHeight; dirty = true; }
  if (patch.cornerRadius !== undefined) inst.cornerRadius = patch.cornerRadius;
  if (patch.kind !== undefined && patch.kind !== inst.kind) {
    inst.kind = patch.kind;
    if (patch.shaderScale === undefined) inst.shaderScale = patch.kind === 'circle' ? CIRCLE_SHADER_SCALE : PILL_SHADER_SCALE;
    if (patch.ringCssPx === undefined) inst.ringCssPx = patch.kind === 'circle' ? 2 : 1;
  }
  if (patch.shaderScale !== undefined) inst.shaderScale = patch.shaderScale;
  if (patch.ringCssPx !== undefined) inst.ringCssPx = patch.ringCssPx;
  if (patch.opacityMul !== undefined) inst.opacityMul = patch.opacityMul;
  if (dirty) resizeInstanceCanvas(inst);
}

export function setInstanceVisible(inst: MetalFxInstance, visible: boolean): void {
  inst.visible = visible;
}

export function setSharedPreset(name: PresetName, theme: PresetTheme): void {
  const s = ensureSharedRenderer();
  s.preset = PRESETS[name].modes[theme];
  s.presetDirty = true;
}

export function pauseShared(): void {
  if (!SHARED || SHARED.pausedAtMs !== null) return;
  SHARED.pausedAtMs = performance.now();
  stopSharedLoop();
}

export function resumeShared(): void {
  if (!SHARED || SHARED.pausedAtMs === null) return;
  SHARED.pausedMs += performance.now() - SHARED.pausedAtMs;
  SHARED.pausedAtMs = null;
  if (SHARED.instances.size > 0) startSharedLoop();
}

export function getSharedFrameCount(): number {
  return SHARED?.frameCount ?? 0;
}

// ─── Internal rendering ───────────────────────────────────────────────────

function resizeInstanceCanvas(inst: MetalFxInstance): void {
  inst.dpr = typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1;
  const w = Math.max(1, Math.round(inst.cssWidth * inst.dpr));
  const h = Math.max(1, Math.round(inst.cssHeight * inst.dpr));
  if (inst.canvas.width !== w) inst.canvas.width = w;
  if (inst.canvas.height !== h) inst.canvas.height = h;
}

/** Erase the interior of the instance canvas leaving only the outer ring visible.
 *  Uses destination-out compositing to knock out a rounded rect inset by ringCssPx. */
function punchInnerHole(inst: MetalFxInstance): void {
  const { ctx, dpr, canvas } = inst;
  const stroke = inst.ringCssPx * dpr;
  const w = canvas.width, h = canvas.height;
  const innerR = Math.max(0, (inst.cornerRadius - inst.ringCssPx) * dpr);
  ctx.save();
  ctx.globalCompositeOperation = 'destination-out';
  ctx.fillStyle = '#000';
  ctx.beginPath();
  ctx.roundRect(stroke, stroke, w - 2 * stroke, h - 2 * stroke, innerR);
  ctx.fill();
  ctx.restore();
}

/**
 * Copy a cropped region of the shared GL canvas into this instance's 2D canvas.
 *
 * The crop is centered and scaled relative to the canonical pill size so that
 * small instances (pills, circles) see a "zoomed in" portion of the shader
 * rather than the entire field compressed into tiny pixels.
 */
function copyShaderToInstance(inst: MetalFxInstance): void {
  if (!SHARED) return;
  const { glCanvas } = SHARED;
  const dpr = inst.dpr;
  const dw = inst.canvas.width, dh = inst.canvas.height;
  if (dw < 1 || dh < 1) return;

  const cw = glCanvas.width, ch = glCanvas.height;
  const bdW = CANONICAL_PILL_W * dpr, bdH = CANONICAL_PILL_H * dpr;
  let srcW = (dw * (cw / bdW)) / inst.shaderScale;
  let srcH = (dh * (ch / bdH)) / inst.shaderScale;
  if (srcW > cw) srcW = cw;
  if (srcH > ch) srcH = ch;
  const sx = Math.max(0, (cw - srcW) / 2);
  const sy = Math.max(0, (ch - srcH) / 2);

  inst.ctx.clearRect(0, 0, dw, dh);
  if (inst.opacityMul < 1) inst.ctx.globalAlpha = inst.opacityMul;
  inst.ctx.drawImage(glCanvas, sx, sy, srcW, srcH, 0, 0, dw, dh);
  if (inst.opacityMul < 1) inst.ctx.globalAlpha = 1;

  punchInnerHole(inst);
  inst.onAfterFrame?.();
}

export type GlowCallback = (inst: MetalFxInstance, nowMs: number) => void;
let _glowCallback: GlowCallback | null = null;

/** Register a callback that the shared loop invokes for staggered glow updates. */
export function setGlowCallback(cb: GlowCallback | null): void {
  _glowCallback = cb;
}



/** Upload all preset-derived uniforms to the GL program. Only called when preset changes. */
function uploadPresetUniforms(): void {
  if (!SHARED) return;
  const { gl, uniforms, preset, glCanvas } = SHARED;
  if (uniforms.u_resolution) gl.uniform2f(uniforms.u_resolution, glCanvas.width, glCanvas.height);
  for (let i = 0; i < 7; i++) {
    const cLoc = uniforms[`u_color${i + 1}`];
    if (cLoc) { const [r, g, b] = hexToRgb(preset.colors[i]); gl.uniform3f(cLoc, r, g, b); }
    const aLoc = uniforms[`u_alpha${i + 1}`];
    if (aLoc) gl.uniform1f(aLoc, preset.alphas[i]);
  }
  if (uniforms.u_intensity) gl.uniform1f(uniforms.u_intensity, preset.intensity);
  if (uniforms.u_scale) gl.uniform1f(uniforms.u_scale, preset.scale);
  if (uniforms.u_direction) gl.uniform1f(uniforms.u_direction, (preset.direction * Math.PI) / 180);
  if (uniforms.u_softness) gl.uniform1f(uniforms.u_softness, preset.softness);
  if (uniforms.u_distortion) gl.uniform1f(uniforms.u_distortion, preset.distortion);
  if (uniforms.u_complexity) gl.uniform1f(uniforms.u_complexity, preset.complexity);
  if (uniforms.u_shape) gl.uniform1f(uniforms.u_shape, preset.shape);
  if (uniforms.u_vignette) gl.uniform1f(uniforms.u_vignette, preset.vignette);
  if (uniforms.u_vigOpacity) gl.uniform1f(uniforms.u_vigOpacity, preset.vigOpacity);
  if (uniforms.u_blur) gl.uniform1f(uniforms.u_blur, preset.blur);
  if (uniforms.u_shaderOpacity) gl.uniform1f(uniforms.u_shaderOpacity, preset.shaderOpacity);
  SHARED.presetDirty = false;
}

function renderSharedFrame(now: number): void {
  if (!SHARED) return;
  const { gl, uniforms, preset, glCanvas } = SHARED;
  const t = ((now - SHARED.startMs - SHARED.pausedMs) / 1000) * preset.speed;

  gl.viewport(0, 0, glCanvas.width, glCanvas.height);
  gl.clearColor(0, 0, 0, 0);
  gl.clear(gl.COLOR_BUFFER_BIT);

  if (SHARED.presetDirty) uploadPresetUniforms();
  if (uniforms.u_time) gl.uniform1f(uniforms.u_time, t);

  gl.drawArrays(gl.TRIANGLES, 0, 6);
  SHARED.frameCount++;
}

/** ~24fps cap — the effect is heavily blurred so higher rates are imperceptible. */
const FRAME_INTERVAL_MS = 42;
let lastFrameMs = 0;

/**
 * Main animation loop. Renders the shared shader, copies to all visible
 * instances, and fires ONE staggered glow update per frame (round-robin).
 */
function tick(now: number): void {
  if (!SHARED) return;
  SHARED.rafId = requestAnimationFrame(tick);
  if (document.hidden) return;
  if (now - lastFrameMs < FRAME_INTERVAL_MS) return;
  lastFrameMs = now;
  let anyVisible = false;
  for (const inst of SHARED.instances) { if (inst.visible) { anyVisible = true; break; } }
  if (anyVisible) {
    renderSharedFrame(now);
    for (const inst of SHARED.instances) { if (inst.visible) copyShaderToInstance(inst); }

    // Staggered glow: one instance per frame avoids CPU spikes from N
    // simultaneous readbacks. With 8 instances at 30fps, each gets a
    // glow update every ~267ms.
    if (_glowCallback && SHARED.glowQueue.length > 0) {
      const queue = SHARED.glowQueue;
      if (SHARED.glowIdx >= queue.length) SHARED.glowIdx = 0;
      const inst = queue[SHARED.glowIdx];
      if (inst.visible) _glowCallback(inst, now);
      SHARED.glowIdx++;
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
    gl.getExtension('WEBGL_lose_context')?.loseContext();
  } catch { /* swallow */ }
  SHARED = null;
}
