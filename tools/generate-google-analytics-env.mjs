// Reads the repo-root `.env` and writes `apps/web/src/app/google-analytics.env.ts`, so the
// Angular build (which can't read `.env` at runtime — there's no process.env in the
// browser) compiles the GA4 measurement id into the bundle.
//
// Runs automatically before `nx build web` / `nx serve web` (project.json dependsOn),
// or manually: `node tools/generate-google-analytics-env.mjs`.
//
// An empty id is the normal state for local dev: GoogleAnalyticsService no-ops without one,
// so nothing is loaded and nothing is sent.
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const envPath = join(root, '.env');
const outPath = join(root, 'apps', 'web', 'src', 'app', 'google-analytics.env.ts');

const env = {};
if (existsSync(envPath)) {
  for (const line of readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (m && !line.trimStart().startsWith('#'))
      env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
}

// The process environment wins over `.env`, as dotenv's does. The e2e dev server sets a fake
// id this way (apps/web-e2e/playwright.config.ts), so the suite can read `search_performed`
// and friends off `dataLayer`, and a real id in someone's `.env` never reaches an e2e build.
const measurementId = process.env.GA_MEASUREMENT_ID ?? env.GA_MEASUREMENT_ID ?? '';

const out = `// AUTO-GENERATED from .env by tools/generate-google-analytics-env.mjs — do not edit by hand.
export const googleAnalyticsEnv = {
  /** GA4 measurement id, e.g. "G-XXXXXXXXXX". Empty disables analytics entirely. */
  measurementId: ${JSON.stringify(measurementId)},
};
`;

writeFileSync(outPath, out);
console.log(
  measurementId
    ? `google-analytics.env.ts written — measurementId ${measurementId}.`
    : 'google-analytics.env.ts written — no GA_MEASUREMENT_ID set, analytics disabled.',
);
