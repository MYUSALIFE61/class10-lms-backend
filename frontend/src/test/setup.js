import '@testing-library/jest-dom/vitest';
import { beforeEach, afterEach, vi } from 'vitest';

const originalFetch = globalThis.fetch;

/**
 * Enforces strict test isolation from any live local preview backend (e.g., localhost:4000).
 * Every frontend test must mock API calls explicitly rather than hitting live ports.
 */
beforeEach(() => {
  globalThis.fetch = vi.fn((url) =>
    Promise.reject(new Error(`Blocked unmocked network request in Vitest: ${String(url)}`))
  );
});

afterEach(() => {
  globalThis.fetch = originalFetch;
});
