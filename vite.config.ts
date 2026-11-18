import { defineConfig } from 'vite';

// For GitHub Pages, set base to '/<repository-name>/' (e.g. '/stunt-double/').
// A relative base also works for any static host.
export default defineConfig({
  base: './',
  build: { target: 'es2020' },
  test: { include: ['tests/**/*.test.ts'] },
} as any);
