import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { WorldViewSection } from '@/ui/screens/sections/WorldViewSection';
import { useGameStore } from '@/game/state/gameStore';
import { createInitialCityState } from '@/simulation/city';

describe('World View UI', () => {
  beforeEach(() => {
    useGameStore.getState().reset();
  });

  it('shows a WebGL fallback with real city data when WebGL is unavailable', () => {
    const originalGetContext = HTMLCanvasElement.prototype.getContext;
    // force unavailable
    HTMLCanvasElement.prototype.getContext = (() => null) as unknown as typeof HTMLCanvasElement.prototype.getContext;

    const cityState = createInitialCityState(0);
    useGameStore.getState().applyCityState(cityState);

    render(<WorldViewSection />);

    expect(screen.getByText(/WebGL unavailable/i)).toBeInTheDocument();
    expect(screen.getByText(cityState.city!.name)).toBeInTheDocument();
    expect(screen.getByText(/Downtown/i)).toBeInTheDocument();

    HTMLCanvasElement.prototype.getContext = originalGetContext;
  });

  it('renders controls and inspector placeholder when WebGL context can be created (mocked)', () => {
    const ctx = {
      getExtension: vi.fn(),
      getParameter: vi.fn(),
    } as unknown as WebGLRenderingContext;

    const originalGetContext = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = ((type: string) => {
      if (type === 'webgl2' || type === 'webgl') return ctx;
      return null;
    }) as unknown as typeof HTMLCanvasElement.prototype.getContext;

    // JSDOM lacks ResizeObserver in some setups
    if (typeof (globalThis as any).ResizeObserver === 'undefined') {
      (globalThis as any).ResizeObserver = class {
        observe() {}
        disconnect() {}
        unobserve() {}
      };
    }

    useGameStore.getState().applyCityState(createInitialCityState(0));
    render(<WorldViewSection />);

    expect(screen.getByRole('toolbar', { name: /world view controls/i })).toBeInTheDocument();
    expect(screen.getByLabelText(/3D city viewport/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Selection inspector/i)).toBeInTheDocument();

    HTMLCanvasElement.prototype.getContext = originalGetContext;
  });
});