/**
 * Vitest setup.
 *
 * The `/vitest` entry point of @testing-library/jest-dom registers the DOM
 * matchers at runtime **and** augments the `expect` types for Vitest — the
 * plain entry point only augments the Jest types.
 */
import '@testing-library/jest-dom/vitest';
