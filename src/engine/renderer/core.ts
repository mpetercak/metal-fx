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
import { PRESETS, type PresetMode, type PresetName, type PresetTheme } from '../presets';
import { compileShader, FRAG_SHADER_SRC, linkProgram, VERT_SHADER_SRC } from '../shaders';

const CANONICAL_GL_SIZE = 150;
export const CANONICAL_PILL_W = 140;
export const CANONICAL_PILL_H = 40;
export const PILL_SHADER_SCALE = 1.6;
export const CIRCLE_SHADER_SCALE = 1.3;

export interface ShaderRGB { r: number; g: number; b: number }

export interface MetalFxInstance {
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
  onAfterFrame?: () => void;
}

export interface SharedRenderer {
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

export let SHARED: SharedRenderer | null = null;

export function ensureSharedRenderer(): SharedRenderer {
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
    glowPixels: new Uint8Array(glCanvas.width * glCanvas.height * 4),
    glowPixelsW: glCanvas.width, glowPixelsH: glCanvas.height,
  };
  return SHARED;
}

export function teardownSharedRenderer(): void {
  if (!SHARED) return;
  const { gl, program, buffer } = SHARED;
  try {
    gl.deleteBuffer(buffer);
    gl.deleteProgram(program);
    gl.getExtension('WEBGL_lose_context')?.loseContext();
  } catch { /* swallow */ }
  SHARED = null;
}
