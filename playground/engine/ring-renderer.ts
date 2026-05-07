import { RING_VERT_SRC, RING_FRAG_SRC } from './ring-shaders';

const FRAME_INTERVAL_MS = 33;
const RING_STEPS = 64;
const SPIN_A_DURATION = 24;
const SPIN_B_DURATION = 14;
const DEG_TO_RAD = Math.PI / 180;

type RGB = [number, number, number];

const ANGLE_A_KFS: [number, number][] = [
  [0, 0], [0.24, 0], [0.29, 140], [0.49, 140],
  [0.54, 200], [0.74, 200], [0.79, 290], [0.99, 290], [1.0, 360],
];
const ANGLE_B_KFS: [number, number][] = [
  [0, 0], [0.3, 120], [0.6, 250], [1.0, 360],
];

function evalKF(kfs: [number, number][], t: number): number {
  if (t <= kfs[0][0]) return kfs[0][1];
  for (let i = 0; i < kfs.length - 1; i++) {
    if (t >= kfs[i][0] && t < kfs[i + 1][0]) {
      const seg = (t - kfs[i][0]) / (kfs[i + 1][0] - kfs[i][0]);
      return kfs[i][1] + seg * (kfs[i + 1][1] - kfs[i][1]);
    }
  }
  return kfs[kfs.length - 1][1];
}

function steppedProgress(timeSec: number, duration: number): number {
  const p = ((timeSec / duration) % 1 + 1) % 1;
  return Math.floor(p * RING_STEPS) / RING_STEPS;
}

function getAngleA(timeSec: number): number {
  return evalKF(ANGLE_A_KFS, steppedProgress(timeSec, SPIN_A_DURATION)) * DEG_TO_RAD;
}

function getAngleB(timeSec: number): number {
  const sp = steppedProgress(timeSec, SPIN_B_DURATION);
  return -evalKF(ANGLE_B_KFS, 1 - sp) * DEG_TO_RAD;
}

export interface RingInstance {
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  cssWidth: number;
  cssHeight: number;
  cornerRadius: number;
  ringCssPx: number;
  colorsA: [RGB, RGB];
  colorsB: [RGB, RGB];
  opacityA: number;
  opacityB: number;
  visible: boolean;
  dpr: number;
}

interface SharedRingRenderer {
  glCanvas: HTMLCanvasElement;
  gl: WebGLRenderingContext;
  program: WebGLProgram;
  uniforms: Record<string, WebGLUniformLocation | null>;
  startMs: number;
  rafId: number;
  instances: Set<RingInstance>;
  lastCanvasW: number;
  lastCanvasH: number;
}

let SHARED: SharedRingRenderer | null = null;
let lastFrameMs = 0;

function compileShader(gl: WebGLRenderingContext, type: number, source: string): WebGLShader {
  const shader = gl.createShader(type);
  if (!shader) throw new Error('ring-renderer: gl.createShader returned null');
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const info = gl.getShaderInfoLog(shader);
    gl.deleteShader(shader);
    throw new Error(`ring-renderer: shader compile failed: ${info ?? ''}`);
  }
  return shader;
}

function ensureShared(): SharedRingRenderer {
  if (SHARED) return SHARED;

  const glCanvas = document.createElement('canvas');
  glCanvas.width = 1;
  glCanvas.height = 1;

  const gl = glCanvas.getContext('webgl', {
    alpha: true, premultipliedAlpha: false, antialias: false, preserveDrawingBuffer: true,
  }) as WebGLRenderingContext | null;
  if (!gl) throw new Error('ring-renderer: WebGL not supported');

  gl.enable(gl.BLEND);
  gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

  const vert = compileShader(gl, gl.VERTEX_SHADER, RING_VERT_SRC);
  const frag = compileShader(gl, gl.FRAGMENT_SHADER, RING_FRAG_SRC);
  const program = gl.createProgram()!;
  gl.attachShader(program, vert);
  gl.attachShader(program, frag);
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    throw new Error(`ring-renderer: link failed: ${gl.getProgramInfoLog(program) ?? ''}`);
  }
  gl.useProgram(program);

  const buffer = gl.createBuffer()!;
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]), gl.STATIC_DRAW);
  const posLoc = gl.getAttribLocation(program, 'a_position');
  gl.enableVertexAttribArray(posLoc);
  gl.vertexAttribPointer(posLoc, 2, gl.FLOAT, false, 0, 0);

  const uNames = [
    'u_resolution', 'u_cornerRadius', 'u_ringWidth',
    'u_angleA', 'u_angleB',
    'u_colorA0', 'u_colorA1', 'u_colorB0', 'u_colorB1',
    'u_opacityA', 'u_opacityB',
  ];
  const uniforms: Record<string, WebGLUniformLocation | null> = {};
  for (const n of uNames) uniforms[n] = gl.getUniformLocation(program, n);

  SHARED = {
    glCanvas, gl, program, uniforms,
    startMs: performance.now(),
    rafId: 0,
    instances: new Set(),
    lastCanvasW: 1,
    lastCanvasH: 1,
  };
  return SHARED;
}

function resizeInstanceCanvas(inst: RingInstance): void {
  inst.dpr = typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1;
  const w = Math.max(1, Math.round(inst.cssWidth * inst.dpr));
  const h = Math.max(1, Math.round(inst.cssHeight * inst.dpr));
  if (inst.canvas.width !== w) inst.canvas.width = w;
  if (inst.canvas.height !== h) inst.canvas.height = h;
}

export interface CreateRingInstanceOptions {
  hostCanvas: HTMLCanvasElement;
  cssWidth: number;
  cssHeight: number;
  cornerRadius: number;
  ringCssPx?: number;
  colorsA: [RGB, RGB];
  colorsB: [RGB, RGB];
  opacityA: number;
  opacityB: number;
}

export function createRingInstance(opts: CreateRingInstanceOptions): RingInstance {
  const renderer = ensureShared();
  const ctx = opts.hostCanvas.getContext('2d', { alpha: true });
  if (!ctx) throw new Error('ring-renderer: canvas 2D context unavailable');

  const inst: RingInstance = {
    canvas: opts.hostCanvas,
    ctx,
    cssWidth: opts.cssWidth,
    cssHeight: opts.cssHeight,
    cornerRadius: opts.cornerRadius,
    ringCssPx: opts.ringCssPx ?? 1,
    colorsA: opts.colorsA,
    colorsB: opts.colorsB,
    opacityA: opts.opacityA,
    opacityB: opts.opacityB,
    visible: true,
    dpr: typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1,
  };
  resizeInstanceCanvas(inst);
  renderer.instances.add(inst);
  if (renderer.rafId === 0) startLoop();
  return inst;
}

export function destroyRingInstance(inst: RingInstance): void {
  if (!SHARED) return;
  SHARED.instances.delete(inst);
  if (SHARED.instances.size === 0) { stopLoop(); teardown(); }
}

export function updateRingInstance(
  inst: RingInstance,
  patch: Partial<Pick<RingInstance, 'cssWidth' | 'cssHeight' | 'cornerRadius' | 'ringCssPx' | 'colorsA' | 'colorsB' | 'opacityA' | 'opacityB'>>,
): void {
  let dirty = false;
  if (patch.cssWidth !== undefined && patch.cssWidth !== inst.cssWidth) { inst.cssWidth = patch.cssWidth; dirty = true; }
  if (patch.cssHeight !== undefined && patch.cssHeight !== inst.cssHeight) { inst.cssHeight = patch.cssHeight; dirty = true; }
  if (patch.cornerRadius !== undefined) inst.cornerRadius = patch.cornerRadius;
  if (patch.ringCssPx !== undefined) inst.ringCssPx = patch.ringCssPx;
  if (patch.colorsA !== undefined) inst.colorsA = patch.colorsA;
  if (patch.colorsB !== undefined) inst.colorsB = patch.colorsB;
  if (patch.opacityA !== undefined) inst.opacityA = patch.opacityA;
  if (patch.opacityB !== undefined) inst.opacityB = patch.opacityB;
  if (dirty) resizeInstanceCanvas(inst);
}

export function setRingInstanceVisible(inst: RingInstance, visible: boolean): void {
  inst.visible = visible;
}

function ensureGlCanvasSize(pw: number, ph: number): void {
  if (!SHARED) return;
  const { glCanvas } = SHARED;
  if (glCanvas.width < pw || glCanvas.height < ph) {
    glCanvas.width = Math.max(glCanvas.width, pw);
    glCanvas.height = Math.max(glCanvas.height, ph);
    SHARED.lastCanvasW = glCanvas.width;
    SHARED.lastCanvasH = glCanvas.height;
  }
}

function renderForInstance(inst: RingInstance, angleA: number, angleB: number): void {
  if (!SHARED) return;
  const { gl, uniforms, glCanvas } = SHARED;
  const dpr = inst.dpr;
  const pw = Math.max(1, Math.round(inst.cssWidth * dpr));
  const ph = Math.max(1, Math.round(inst.cssHeight * dpr));

  ensureGlCanvasSize(pw, ph);

  gl.viewport(0, 0, pw, ph);
  gl.scissor(0, 0, pw, ph);
  gl.enable(gl.SCISSOR_TEST);
  gl.clearColor(0, 0, 0, 0);
  gl.clear(gl.COLOR_BUFFER_BIT);
  gl.disable(gl.SCISSOR_TEST);

  if (uniforms.u_resolution) gl.uniform2f(uniforms.u_resolution, pw, ph);
  if (uniforms.u_cornerRadius) gl.uniform1f(uniforms.u_cornerRadius, inst.cornerRadius * dpr);
  if (uniforms.u_ringWidth) gl.uniform1f(uniforms.u_ringWidth, inst.ringCssPx * dpr);
  if (uniforms.u_angleA) gl.uniform1f(uniforms.u_angleA, angleA);
  if (uniforms.u_angleB) gl.uniform1f(uniforms.u_angleB, angleB);
  if (uniforms.u_colorA0) gl.uniform3f(uniforms.u_colorA0, ...inst.colorsA[0]);
  if (uniforms.u_colorA1) gl.uniform3f(uniforms.u_colorA1, ...inst.colorsA[1]);
  if (uniforms.u_colorB0) gl.uniform3f(uniforms.u_colorB0, ...inst.colorsB[0]);
  if (uniforms.u_colorB1) gl.uniform3f(uniforms.u_colorB1, ...inst.colorsB[1]);
  if (uniforms.u_opacityA) gl.uniform1f(uniforms.u_opacityA, inst.opacityA);
  if (uniforms.u_opacityB) gl.uniform1f(uniforms.u_opacityB, inst.opacityB);

  gl.drawArrays(gl.TRIANGLES, 0, 6);

  inst.ctx.clearRect(0, 0, pw, ph);
  inst.ctx.drawImage(glCanvas, 0, glCanvas.height - ph, pw, ph, 0, 0, pw, ph);
}

function tick(now: number): void {
  if (!SHARED) return;
  SHARED.rafId = requestAnimationFrame(tick);
  if (document.hidden) return;
  if (now - lastFrameMs < FRAME_INTERVAL_MS) return;
  lastFrameMs = now;

  let anyVisible = false;
  for (const inst of SHARED.instances) {
    if (inst.visible) { anyVisible = true; break; }
  }
  if (!anyVisible) return;

  const timeSec = (now - SHARED.startMs) / 1000;
  const angleA = getAngleA(timeSec);
  const angleB = getAngleB(timeSec);

  for (const inst of SHARED.instances) {
    if (inst.visible) renderForInstance(inst, angleA, angleB);
  }
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
