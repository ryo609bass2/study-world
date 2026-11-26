import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  testMatch: '*.spec.ts',
  timeout: 45_000,
  expect: { timeout: 10_000 },
  use: {
    ...devices['Desktop Chrome'],
    baseURL: 'http://127.0.0.1:4173/study-world/',
    viewport: { width: 1366, height: 768 },
    launchOptions: {
      executablePath: process.env.STUDY_WORLD_CHROMIUM,
      args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
    },
    trace: 'retain-on-failure',
  },
  webServer: {
    command: 'node e2e/serve-dist.mjs',
    url: 'http://127.0.0.1:4173/study-world/',
    reuseExistingServer: !process.env.CI,
  },
});
