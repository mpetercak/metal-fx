import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from 'react';
import {
  addReflectionTarget,
  createInstance,
  destroyInstance,
  injectGlow,
  pauseShared,
  registerGlowInstance,
  removeReflectionTarget,
  resumeShared,
  scheduleReflectionPaint,
  setGlowCallback,
  setInstanceVisible,
  setSharedPreset,
  unregisterGlowInstance,
  updateGlow,
  updateInstance,
  type MetalFxInstance,
} from './engine';
import { ensureStylesInjected } from './styles';
import type { MetalFxProps, MetalFxTheme } from './types';

ensureStylesInjected();

/**
 * Global registry mapping each live MetalFxInstance to its glow handles.
 * The shared renderer's tick() loop invokes one glow update per frame via
 * setGlowCallback; this map lets it find the right SVG handles for the
 * instance being updated.
 */
const glowHandlesMap = new Map<MetalFxInstance, { handles: ReturnType<typeof injectGlow>; themeRef: { current: 'dark' | 'light' } }>();

setGlowCallback((inst, nowMs) => {
  const entry = glowHandlesMap.get(inst);
  if (!entry) return;
  updateGlow(entry.handles, inst, nowMs, inst.opacityMul, entry.themeRef.current);
});

function useResolvedTheme(theme: MetalFxTheme): 'dark' | 'light' {
  const [resolved, setResolved] = useState<'dark' | 'light'>(() => {
    if (theme !== 'auto') return theme;
    if (typeof window === 'undefined' || !window.matchMedia) return 'dark';
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  });

  useEffect(() => {
    if (theme !== 'auto') { setResolved(theme); return; }
    if (typeof window === 'undefined' || !window.matchMedia) return;
    const mql = window.matchMedia('(prefers-color-scheme: dark)');
    const update = () => setResolved(mql.matches ? 'dark' : 'light');
    update();
    mql.addEventListener('change', update);
    return () => mql.removeEventListener('change', update);
  }, [theme]);

  return resolved;
}

export const MetalFx = forwardRef<HTMLDivElement, MetalFxProps>(function MetalFx(
  {
    children,
    variant = 'button',
    preset = 'chromatic',
    theme = 'auto',
    strength = 1,
    paused = false,
    borderRadius,
    normalizeHostStyles = true,
    reflectionTargets,
    disableGlow = false,
    className,
    style,
    ...rest
  },
  forwardedRef
) {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const innerRef = useRef<HTMLDivElement | null>(null);
  const glowHostRef = useRef<HTMLDivElement | null>(null);
  const contentRef = useRef<HTMLDivElement | null>(null);
  const instanceRef = useRef<MetalFxInstance | null>(null);
  const glowHandlesRef = useRef<ReturnType<typeof injectGlow> | null>(null);
  const themeRef = useRef<'dark' | 'light'>('dark');
  const initialWrapperRadiusRef = useRef<number>(0);

  const resolvedTheme = useResolvedTheme(theme);
  themeRef.current = resolvedTheme;
  const shape: 'pill' | 'circle' = variant === 'circle' ? 'circle' : 'pill';
  const glowEnabled = !disableGlow;

  useImperativeHandle(forwardedRef, () => rootRef.current as HTMLDivElement, []);
  useLayoutEffect(() => { ensureStylesInjected(); }, []);

  useEffect(() => { setSharedPreset(preset, resolvedTheme); }, [preset, resolvedTheme]);
  useEffect(() => { if (paused) pauseShared(); else resumeShared(); }, [paused]);

  // Main lifecycle: create the renderer instance, set up ResizeObserver +
  // IntersectionObserver, inject glow SVG, and register for staggered updates.
  // biome-ignore lint/correctness/useExhaustiveDependencies: borderRadius changes handled by separate effect
  useLayoutEffect(() => {
    const canvas = canvasRef.current;
    const root = rootRef.current;
    const glowHost = glowHostRef.current;
    if (!canvas || !root) return;
    if (glowEnabled && !glowHost) return;

    {
      const computed = getComputedStyle(root);
      const parsed = parseFloat(computed.borderTopLeftRadius);
      initialWrapperRadiusRef.current = Number.isFinite(parsed) ? parsed : 0;
    }

    const measure = () => {
      const rect = root.getBoundingClientRect();
      const cssWidth = Math.max(1, Math.round(rect.width));
      const cssHeight = Math.max(1, Math.round(rect.height));
      const rawRadius = (() => {
        if (typeof borderRadius === 'number') return borderRadius;
        const childEl = contentRef.current?.firstElementChild as HTMLElement | null;
        if (childEl) {
          const parsed = parseFloat(getComputedStyle(childEl).borderTopLeftRadius);
          if (Number.isFinite(parsed) && parsed > 0) return parsed;
        }
        return initialWrapperRadiusRef.current;
      })();
      const cornerRadius = shape === 'circle'
        ? Math.max(rawRadius, Math.min(cssWidth, cssHeight) / 2)
        : rawRadius;
      return { cssWidth, cssHeight, cornerRadius };
    };

    const initial = measure();
    instanceRef.current = createInstance({
      hostCanvas: canvas,
      cssWidth: initial.cssWidth,
      cssHeight: initial.cssHeight,
      cornerRadius: initial.cornerRadius,
      kind: shape,
      onAfterFrame: scheduleReflectionPaint,
    });
    root.style.setProperty('--mfx-radius', `${initial.cornerRadius}px`);
    root.style.borderRadius = `${initial.cornerRadius}px`;

    if (glowEnabled && glowHost) {
      glowHandlesRef.current = injectGlow(glowHost, {
        width: initial.cssWidth,
        height: initial.cssHeight,
        cornerRadius: initial.cornerRadius,
        kind: shape,
      });
    }

    let resizeRaf = 0;
    const ro = new ResizeObserver(() => {
      if (resizeRaf !== 0) return;
      resizeRaf = requestAnimationFrame(() => {
        resizeRaf = 0;
        const next = measure();
        const inst = instanceRef.current;
        if (!inst) return;
        updateInstance(inst, { cssWidth: next.cssWidth, cssHeight: next.cssHeight, cornerRadius: next.cornerRadius });
        root.style.setProperty('--mfx-radius', `${next.cornerRadius}px`);
        root.style.borderRadius = `${next.cornerRadius}px`;
        if (glowEnabled && glowHost) {
          glowHost.innerHTML = '';
          glowHandlesRef.current = injectGlow(glowHost, {
            width: next.cssWidth, height: next.cssHeight, cornerRadius: next.cornerRadius, kind: shape,
          });
          if (inst && glowHandlesRef.current) {
            glowHandlesMap.set(inst, { handles: glowHandlesRef.current, themeRef });
          }
        }
      });
    });
    ro.observe(root);

    let io: IntersectionObserver | null = null;
    if (typeof IntersectionObserver !== 'undefined') {
      io = new IntersectionObserver(
        (entries) => { const inst = instanceRef.current; if (!inst) return; for (const e of entries) setInstanceVisible(inst, e.isIntersecting); },
        { rootMargin: '64px' }
      );
      io.observe(root);
    }

    if (glowEnabled && instanceRef.current && glowHandlesRef.current) {
      glowHandlesMap.set(instanceRef.current, { handles: glowHandlesRef.current, themeRef });
      registerGlowInstance(instanceRef.current);
    }

    return () => {
      ro.disconnect();
      io?.disconnect();
      if (resizeRaf !== 0) cancelAnimationFrame(resizeRaf);
      const inst = instanceRef.current;
      if (inst) {
        glowHandlesMap.delete(inst);
        unregisterGlowInstance(inst);
        destroyInstance(inst);
      }
      instanceRef.current = null;
      glowHandlesRef.current = null;
      if (glowHost) glowHost.innerHTML = '';
    };
  }, [shape, glowEnabled]);

  useEffect(() => {
    const inst = instanceRef.current;
    if (!inst) return;
    const cap = variant === 'button' ? 0.92 : 1;
    updateInstance(inst, { opacityMul: Math.max(0, Math.min(1, strength * cap)) });
  }, [strength, variant]);

  useEffect(() => {
    const inst = instanceRef.current;
    const root = rootRef.current;
    if (!inst || !root || !reflectionTargets || resolvedTheme !== 'dark') return;
    const live = reflectionTargets.flatMap((r) => (r.current ? [r.current] : []));
    for (const el of live) addReflectionTarget(el, inst, root);
    return () => { for (const el of live) removeReflectionTarget(el); };
  }, [reflectionTargets, resolvedTheme]);

  // biome-ignore lint/correctness/useExhaustiveDependencies: trigger deps for radius re-sync
  useEffect(() => {
    const root = rootRef.current;
    const inst = instanceRef.current;
    if (!root || !inst) return;
    root.style.setProperty('--mfx-radius', `${inst.cornerRadius}px`);
    root.style.borderRadius = `${inst.cornerRadius}px`;
  }, [borderRadius, resolvedTheme, variant]);

  const wrapperStyle = useMemo<CSSProperties>(
    () => ({ ...style, ['--mfx-strength' as string]: String(Math.min(1, Math.max(0, strength))) }),
    [style, strength]
  );

  return (
    <div
      {...rest}
      ref={rootRef}
      className={['metal-fx-root', className].filter(Boolean).join(' ')}
      data-variant={variant}
      data-shape={shape}
      data-theme={resolvedTheme}
      data-paused={paused ? 'true' : undefined}
      data-normalize={normalizeHostStyles ? 'true' : 'false'}
      style={wrapperStyle}
    >
      <canvas
        ref={canvasRef}
        className="metal-fx-canvas"
        style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }}
      />
      <div ref={innerRef} className="metal-fx-inner" aria-hidden="true" style={{ position: 'absolute', inset: 3 }} />
      {glowEnabled && (
        <div
          ref={glowHostRef}
          aria-hidden="true"
          style={{ position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 3, borderRadius: 'inherit' }}
        />
      )}
      <div ref={contentRef} className="metal-fx-content">{children}</div>
    </div>
  );
});

MetalFx.displayName = 'MetalFx';
