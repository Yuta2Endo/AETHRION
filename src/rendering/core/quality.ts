import type { RenderQuality } from '@/rendering/types';

export function detectRenderQuality(): RenderQuality {
  const isBrowser = typeof window !== 'undefined';
  const dpr = isBrowser ? window.devicePixelRatio || 1 : 1;
  const cores = isBrowser && typeof navigator !== 'undefined' ? navigator.hardwareConcurrency ?? 4 : 4;
  const memory = isBrowser && typeof navigator !== 'undefined' ? (navigator as Navigator & { deviceMemory?: number }).deviceMemory ?? 4 : 4;

  const constrained = cores <= 4 || memory <= 4;

  return {
    pixelRatio: Math.min(dpr, constrained ? 1.5 : 2),
    antialias: !constrained,
    shadows: false,
  };
}

export function isWebGLAvailable(): boolean {
  if (typeof document === 'undefined') return false;
  try {
    const canvas = document.createElement('canvas');
    return !!(canvas.getContext('webgl2') || canvas.getContext('webgl'));
  } catch {
    return false;
  }
}