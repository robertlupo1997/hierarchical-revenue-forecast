import { defineConfig, devices } from '@playwright/test';

/**
 * Playwright configuration for MLRF Dashboard E2E tests.
 *
 * Run tests with: bunx playwright test
 * Run in UI mode: bunx playwright test --ui
 */
export default defineConfig({
  testDir: './e2e',

  // Run tests in parallel
  fullyParallel: true,

  // Fail build on CI if test.only was left in source
  forbidOnly: !!process.env.CI,

  // Retry failed tests on CI
  retries: process.env.CI ? 2 : 0,

  // Limit workers on CI
  workers: process.env.CI ? 1 : undefined,

  // Reporter to use
  reporter: process.env.CI ? 'github' : 'html',

  // Shared settings for all projects
  use: {
    // Base URL for page.goto() calls
    baseURL: 'http://localhost:4173',

    // Collect trace when retrying failed test
    trace: 'on-first-retry',

    // Screenshot on failure
    screenshot: 'only-on-failure',
  },

  // Browser projects
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],

  // Local dev server to run before tests
  webServer: {
    command: 'bun run build && bun run preview',
    url: 'http://localhost:4173',
    reuseExistingServer: !process.env.CI,
    timeout: 120 * 1000, // 2 minutes for build
  },
});
