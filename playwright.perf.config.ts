import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests/perf',
  testMatch: '**/*.perf.ts',
  outputDir: './test-results/perf-runner',
  timeout: 300_000,
  expect: {
    timeout: 300_000,
  },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: 'line',
  use: {
    baseURL: 'http://127.0.0.1:4174',
    headless: true,
  },
  webServer: {
    command: 'npm run preview -- --host 127.0.0.1 --port 4174',
    url: 'http://127.0.0.1:4174',
    reuseExistingServer: false,
    timeout: 30_000,
  },
});
