import type { RenderQuality } from '@/rendering/types';

export type RenderQualityProfile = 'auto' | 'low' | 'medium' | 'high';

function readProfile(): RenderQualityProfile {
  const value = (import.meta.env.VITE_RENDER_QUALITY as string | undefined)?.toLowerCase();
  if (value === 'low' || value === 'medium' || value === 'high') return value;
  return 'auto';
}

export function detectRenderQuality(profile: RenderQualityProfile = readProfile()): RenderQuality {
  const isBrowser = typeof window !== 'undefined';
  const dpr = isBrowser ? window.devicePixelRatio || 1 : 1;
  const cores = isBrowser && typeof navigator !== 'undefined' ? navigator.hardwareConcurrency ?? 4 : 4;
  const memory = isBrowser && typeof navigator !== 'undefined' ? (navigator as Navigator & { deviceMemory?: number }).deviceMemory ?? 4 : 4;

  const constrained = cores <= 4 || memory <= 4;

  if (profile === 'low') {
    return { pixelRatio: Math.min(dpr, 1.25), antialias: false, shadows: false };
  }
  if (profile === 'medium') {
    return { pixelRatio: Math.min(dpr, 1.5), antialias: !constrained, shadows: false };
  }
  if (profile === 'high') {
    return { pixelRatio: Math.min(dpr, 2), antialias: true, shadows: false };
  }

  // auto
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