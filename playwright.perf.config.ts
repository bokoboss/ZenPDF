import { defineConfig } from '@playwright/test';

const perfPort = Number(process.env.ZENPDF_PERF_PORT ?? '4174');
const perfUrl = `http://127.0.0.1:${perfPort}`;

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
    baseURL: perfUrl,
    headless: true,
  },
  webServer: {
    command: `npm run preview -- --host 127.0.0.1 --port ${perfPort}`,
    url: perfUrl,
    reuseExistingServer: process.env.ZENPDF_PERF_EXTERNAL_SERVER === '1',
    timeout: 30_000,
  },
});
