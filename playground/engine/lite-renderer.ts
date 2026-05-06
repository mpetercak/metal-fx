import { hexToRgb, PRESETS, type PresetMode, type PresetName, type PresetTheme } from '../../src/engine/presets';
import { LITE_FRAG_SRC, LITE_VERT_SRC } from './lite-shaders';

const CANONICAL_GL_SIZE = 150;
const CANONICAL_PILL_W = 140;
const CANONICAL_PILL_H = 40;
const PILL_SHADER_SCALE = 1.6;
const CIRCLE_SHADER_SCALE = 1.3;
const FRAME_INTERVAL_MS = 33;

export interface LiteInstance {
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  cssWidth: number;
  cssHeight: number;
  cornerRadius: number;
  kind: 'pill' | 'circle';
  ringCssPx: number;
  shaderScale: number;
  opacityMul: number;
  visible: boolean;
  dpr: number;
}

interface LiteRenderer {
  glCanvas: HTMLCanvasElement;
  gl: WebGLRenderingContext;
  program: WebGLProgram;
  uniforms: Record<string, WebGLUniformLocation | null>;
  preset: PresetMode;
  presetName: PresetName;
  presetDirty: boolean;
  startMs: number;
  rafId: number;
  dpr: number;
  instances: Set<LiteInstance>;
}

let SHARED: LiteRenderer | null = null;
let lastFrameMs = 0;

function compileShader(gl: WebGLRenderingContext, type: number, source: string): WebGLShader {
  const shader = gl.createShader(type);
  if (!shader) throw new Error('lite-renderer: gl.createShader returned null');
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const info = gl.getShaderInfoLog(shader);
    gl.deleteShader(shader);
    throw new Error(`lite-renderer: shader compile failed: ${info ?? ''}`);
  }
  return shader;
}

function ensureSharedRenderer(): LiteRenderer {
  if (SHARED) return SHARED;

  const dpr = typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1;
  const glCanvas = document.createElement('canvas');
  glCanvas.width = CANONICAL_GL_SIZE * dpr;
  glCanvas.height = CANONICAL_GL_SIZE * dpr;

  const gl = (glCanvas.getContext('webgl', {
    alpha: true, premultipliedAlpha: false, antialias: false, preserveDrawingBuffer: true,
  }) ?? glCanvas.getContext('experimental-webgl')) as WebGLRenderingContext | null;
  if (!gl) throw new Error('lite-renderer: WebGL not supported');

  gl.enable(gl.BLEND);
  gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

  const vert = compileShader(gl, gl.VERTEX_SHADER, LITE_VERT_SRC);
  const frag = compileShader(gl, gl.FRAGMENT_SHADER, LITE_FRAG_SRC);
  const program = gl.createProgram()!;
  gl.attachShader(program, vert);
  gl.attachShader(program, frag);
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    throw new Error(`lite-renderer: link failed: ${gl.getProgramInfoLog(program) ?? ''}`);
  }
  gl.useProgram(program);

  const buffer = gl.createBuffer()!;
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]), gl.STATIC_DRAW);
  const posLoc = gl.getAttribLocation(program, 'a_position');
  gl.enableVertexAttribArray(posLoc);
  gl.vertexAttribPointer(posLoc, 2, gl.FLOAT, false, 0, 0);

  const uNames = [
    'u_resolution', 'u_time',
    'u_color1', 'u_color2', 'u_color3',
    'u_intensity', 'u_scale', 'u_direction',
    'u_distortion', 'u_shaderOpacity',
  ];
  const uniforms: Record<string, WebGLUniformLocation | null> = {};
  for (const n of uNames) uniforms[n] = gl.getUniformLocation(program, n);

  SHARED = {
    glCanvas, gl, program, uniforms,
    preset: PRESETS.chromatic.modes.dark,
    presetName: 'chromatic',
    presetDirty: true,
    startMs: performance.now(),
    rafId: 0, dpr,
    instances: new Set(),
  };
  return SHARED;
}

function uploadPresetUniforms(): void {
  if (!SHARED) return;
  const { gl, uniforms, preset, presetName, glCanvas } = SHARED;
  if (uniforms.u_resolution) gl.uniform2f(uniforms.u_resolution, glCanvas.width, glCanvas.height);

  const colors = preset.colors;
  const pick = pickLiteColors(presetName, colors);
  if (uniforms.u_color1) { const [r, g, b] = hexToRgb(pick[0]); gl.uniform3f(uniforms.u_color1, r, g, b); }
  if (uniforms.u_color2) { const [r, g, b] = hexToRgb(pick[1]); gl.uniform3f(uniforms.u_color2, r, g, b); }
  if (uniforms.u_color3) { const [r, g, b] = hexToRgb(pick[2]); gl.uniform3f(uniforms.u_color3, r, g, b); }

  if (uniforms.u_intensity) gl.uniform1f(uniforms.u_intensity, preset.intensity);
  if (uniforms.u_scale) gl.uniform1f(uniforms.u_scale, preset.scale);
  if (uniforms.u_direction) gl.uniform1f(uniforms.u_direction, (preset.direction * Math.PI) / 180);
  if (uniforms.u_distortion) gl.uniform1f(uniforms.u_distortion, preset.distortion);
  if (uniforms.u_shaderOpacity) gl.uniform1f(uniforms.u_shaderOpacity, preset.shaderOpacity);
  SHARED.presetDirty = false;
}

function pickLiteColors(name: PresetName, colors: string[]): [string, string, string] {
  if (name === 'chromatic') return [colors[0], colors[1], colors[3]];
  if (name === 'gold') return [colors[0], colors[3], colors[1]];
  return [colors[0], colors[1], colors[3]];
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
}

export function createInstance(opts: CreateInstanceOptions): LiteInstance {
  const renderer = ensureSharedRenderer();
  const ctx = opts.hostCanvas.getContext('2d', { alpha: true });
  if (!ctx) throw new Error('lite-renderer: canvas 2D context unavailable');

  const inst: LiteInstance = {
    canvas: opts.hostCanvas, ctx,
    cssWidth: opts.cssWidth, cssHeight: opts.cssHeight,
    cornerRadius: opts.cornerRadius,
    kind: opts.kind,
    ringCssPx: opts.ringCssPx ?? (opts.kind === 'circle' ? 2 : 1),
    shaderScale: opts.shaderScale ?? (opts.kind === 'circle' ? CIRCLE_SHADER_SCALE : PILL_SHADER_SCALE),
    opacityMul: opts.opacityMul ?? 1,
    visible: true,
    dpr: typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1,
  };
  resizeInstanceCanvas(inst);
  renderer.instances.add(inst);
  if (renderer.rafId === 0) startLoop();
  return inst;
}

export function destroyInstance(inst: LiteInstance): void {
  if (!SHARED) return;
  SHARED.instances.delete(inst);
  if (SHARED.instances.size === 0) { stopLoop(); teardown(); }
}

export function updateInstance(
  inst: LiteInstance,
  patch: Partial<Pick<LiteInstance, 'cssWidth' | 'cssHeight' | 'cornerRadius' | 'kind' | 'shaderScale' | 'ringCssPx' | 'opacityMul'>>,
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

export function setInstanceVisible(inst: LiteInstance, visible: boolean): void {
  inst.visible = visible;
}

export function setSharedPreset(name: PresetName, theme: PresetTheme): void {
  const s = ensureSharedRenderer();
  s.preset = PRESETS[name].modes[theme];
  s.presetName = name;
  s.presetDirty = true;
}

// ─── Internal rendering ───────────────────────────────────────────────────

function resizeInstanceCanvas(inst: LiteInstance): void {
  inst.dpr = typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1;
  const w = Math.max(1, Math.round(inst.cssWidth * inst.dpr));
  const h = Math.max(1, Math.round(inst.cssHeight * inst.dpr));
  if (inst.canvas.width !== w) inst.canvas.width = w;
  if (inst.canvas.height !== h) inst.canvas.height = h;
}

function punchInnerHole(inst: LiteInstance): void {
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

function copyShaderToInstance(inst: LiteInstance): void {
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
}

function renderFrame(now: number): void {
  if (!SHARED) return;
  const { gl, uniforms, preset, glCanvas } = SHARED;
  const t = ((now - SHARED.startMs) / 1000) * preset.speed;

  gl.viewport(0, 0, glCanvas.width, glCanvas.height);
  gl.clearColor(0, 0, 0, 0);
  gl.clear(gl.COLOR_BUFFER_BIT);

  if (SHARED.presetDirty) uploadPresetUniforms();
  if (uniforms.u_time) gl.uniform1f(uniforms.u_time, t);

  gl.drawArrays(gl.TRIANGLES, 0, 6);
}

function tick(now: number): void {
  if (!SHARED) return;
  SHARED.rafId = requestAnimationFrame(tick);
  if (document.hidden) return;
  if (now - lastFrameMs < FRAME_INTERVAL_MS) return;
  lastFrameMs = now;

  let anyVisible = false;
  for (const inst of SHARED.instances) { if (inst.visible) { anyVisible = true; break; } }
  if (!anyVisible) return;

  renderFrame(now);
  for (const inst of SHARED.instances) { if (inst.visible) copyShaderToInstance(inst); }
}

function startLoop(): void {
  if (!SHARED || SHARED.rafId !== 0) return;
  SHARED.rafId = requestAnimationFrame(tick);
}

function stopLoop(): void {
  if (!SHARED) return;
  if (SHARED.rafId !== 0) cancelAnimationFrame(SHARED.rafId);
  SHARED.rafId = 0;
}

function teardown(): void {
  if (!SHARED) return;
  const { gl, program } = SHARED;
  try {
    gl.deleteProgram(program);
    gl.getExtension('WEBGL_lose_context')?.loseContext();
  } catch { /* swallow */ }
  SHARED = null;
}
