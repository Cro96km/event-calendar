import { defineConfig } from 'vitest/config';
import { collectApi } from './scripts/collect-api';

// base は相対: GitHub Pages のサブパス(/<repo>/)でも動かす
export default defineConfig({
  base: './',
  plugins: [collectApi()],
  test: {
    include: ['tests/**/*.test.ts'],
  },
});
