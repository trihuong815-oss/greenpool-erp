// Phase A.7 (2026-06-07): Vitest config.
// Test infrastructure đầu tiên cho project. Foundation cho Phase B (test coverage 30% trọng yếu).

import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    environment: 'node',
    globals: true,
    include: ['tests/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      include: ['lib/**/*.ts', 'app/api/**/*.ts'],
      exclude: ['**/*.test.ts', '**/node_modules/**'],
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './'),
      // Phase C.4 (2026-06-07): shim `server-only` cho test môi trường node.
      // Next.js `server-only` package chỉ tồn tại trong webpack bundle; vitest
      // chạy raw Node → cần alias rỗng để import không throw.
      'server-only': path.resolve(__dirname, './tests/__mocks__/server-only.ts'),
    },
  },
});
