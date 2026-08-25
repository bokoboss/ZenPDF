import { defineConfig } from '@playwright/test';

const e2ePort = Number(process.env.ZENPDF_E2E_PORT ?? '4173');
const e2eUrl = `http://127.0.0.1:${e2ePort}`;

export default defineConfig({
  testDir: './tests/e2e',
  testMatch: '**/*.e2e.ts',
  timeout: 60_000,
  expect: {
    timeout: 15_000,
  },
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? 'line' : 'list',
  use: {
    baseURL: e2eUrl,
    headless: true,
    acceptDownloads: true,
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
  },
  webServer: {
    command: `npm run preview -- --host 127.0.0.1 --port ${e2ePort}`,
    url: e2eUrl,
    reuseExistingServer: !process.env.CI,
    timeout: 30_000,
  },
});
