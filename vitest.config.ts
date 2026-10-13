import { defineConfig } from 'vitest/config';
import { loadEnv } from 'vite';
import path from 'node:path';
// Las pruebas leen .env.test (y .env). Las de integracion exigen que DATABASE_NAME contenga "test".
export default defineConfig(({ mode }) => ({
  resolve: { alias: { '@': path.resolve(__dirname, 'src') } },
  test: { environment: 'node', testTimeout: 20000, env: loadEnv(mode, process.cwd(), '') },
}));
