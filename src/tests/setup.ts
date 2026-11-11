/**
 * Vitest setup.
 *
 * The `/vitest` entry point of @testing-library/jest-dom registers the DOM
 * matchers at runtime **and** augments the `expect` types for Vitest — the
 * plain entry point only augments the Jest types.
 */
import '@testing-library/jest-dom/vitest';

// JSDOM logs "Not implemented: HTMLCanvasElement.prototype.getContext" to stderr
// when getContext is called without the optional canvas package. The rendering
// layer treats this as WebGL unavailable, so provide a quiet default stub.
if (typeof HTMLCanvasElement !== 'undefined') {
  const original = HTMLCanvasElement.prototype.getContext;
  if (!original || original === (HTMLCanvasElement.prototype as any)._stubbedGetContext) {
    // leave as-is
  }
  HTMLCanvasElement.prototype.getContext = function getContext(
    this: HTMLCanvasElement,
    contextId: string,
    ...args: unknown[]
  ) {
    try {
      if (typeof original === 'function') {
        return (original as any).call(this, contextId, ...args);
      }
    } catch {
      // fall through
    }
    return null;
  } as typeof HTMLCanvasElement.prototype.getContext;
}

// Some jsdom environments lack ResizeObserver.
if (typeof (globalThis as any).ResizeObserver === 'undefined') {
  (globalThis as any).ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
}
