import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';
import { CSP } from './src/headers.ts';

export default defineConfig({
  plugins: [react()],
  build: { target: 'es2022', assetsInlineLimit: 0 },
  // Same CSP as production, so end-to-end tests catch violations.
  preview: { headers: { 'Content-Security-Policy': CSP } },
  test: { include: ['tests/**/*.test.ts'] },
});
