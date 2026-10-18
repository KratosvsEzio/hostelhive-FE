import { defineConfig, devices } from '@playwright/test';
import { nxE2EPreset } from '@nx/playwright/preset';
import { workspaceRoot } from '@nx/devkit';

// The suite starts its own dev server, on E2E_PORT (default 4200). It does not reuse one that
// is already listening: with several checkouts or worktrees on one machine, the server on 4200
// is often another tree's, and reusing it tests that code while reporting on this one. A busy
// port therefore fails loudly — pick another with E2E_PORT, or set E2E_REUSE_SERVER=1 when the
// running server is known to be this checkout's.
const port = Number(process.env['E2E_PORT'] || 4200);
const serverUrl = `http://localhost:${port}`;

// For CI, you may want to set BASE_URL to the deployed application.
const baseURL = process.env['BASE_URL'] || serverUrl;

/**
 * The GA4 id the e2e dev server is built with. Fake, so nothing can reach a real property, and
 * set at all so analytics runs and specs can read the events off `window.dataLayer`. Specs that
 * read them grant consent and block Google's hosts (`support/analytics.ts`).
 */
const E2E_GA_MEASUREMENT_ID = 'G-E2ETEST000';

/**
 * Read environment variables from file.
 * https://github.com/motdotla/dotenv
 */
// require('dotenv').config();

/**
 * See https://playwright.dev/docs/test-configuration.
 */
export default defineConfig({
  ...nxE2EPreset(__filename, { testDir: './src' }),
  /* Shared settings for all the projects below. See https://playwright.dev/docs/api/class-testoptions. */
  use: {
    baseURL,
    /* Collect trace when retrying the failed test. See https://playwright.dev/docs/trace-viewer */
    trace: 'on-first-retry',
    // With a measurement id built in, the consent banner opens on every page and sits over
    // the bottom of it. Every spec starts having declined; analytics specs grant it themselves.
    storageState: {
      cookies: [],
      origins: [
        {
          origin: new URL(baseURL).origin,
          localStorage: [{ name: 'hh.consent.analytics', value: 'denied' }],
        },
      ],
    },
  },
  /* Run your local dev server before starting the tests */
  webServer: {
    command: `npx nx run web:serve --port ${port}`,
    url: serverUrl,
    reuseExistingServer: process.env['E2E_REUSE_SERVER'] === '1',
    cwd: workspaceRoot,
    // Read by tools/generate-google-analytics-env.mjs, which `serve` runs first.
    env: { GA_MEASUREMENT_ID: E2E_GA_MEASUREMENT_ID },
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },

    {
      name: 'firefox',
      use: { ...devices['Desktop Firefox'] },
    },

    {
      name: 'webkit',
      use: { ...devices['Desktop Safari'] },
    },

    // Uncomment for mobile browsers support
    /* {
      name: 'Mobile Chrome',
      use: { ...devices['Pixel 5'] },
    },
    {
      name: 'Mobile Safari',
      use: { ...devices['iPhone 12'] },
    }, */

    // Uncomment for branded browsers
    /* {
      name: 'Microsoft Edge',
      use: { ...devices['Desktop Edge'], channel: 'msedge' },
    },
    {
      name: 'Google Chrome',
      use: { ...devices['Desktop Chrome'], channel: 'chrome' },
    } */
  ],
});
