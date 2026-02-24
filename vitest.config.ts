import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    testTimeout: 30000,
    hookTimeout: 30000,
    setupFiles: ['./src/__tests__/setup.ts'],
    fileParallelism: false,
    sequence: {
      sequential: true,
    },
    env: {
      DATABASE_URL: 'postgresql://agentscan:agentscan@localhost:5432/agentscan_test',
      STORAGE_PATH: './test-storage',
      BASE_URL: 'http://localhost:3000',
      ADMIN_SECRET: 'test-admin-secret',
    },
  },
});
