// Reads the repo-root `.env` and writes `apps/web/src/app/maps.env.ts`, so the Angular
// build (which can't read `.env` at runtime — there's no process.env in the browser)
// compiles the CARTO basemap key into the bundle.
//
// Runs automatically before `nx build web` / `nx serve web` (project.json dependsOn),
// or manually: `node tools/generate-maps-env.mjs`.
//
// An empty key is a working state, not a broken one: CARTO still serves tiles without a
// key, stamped "API KEY REQUIRED". The map draws either way, so a developer who has not
// set one gets a usable map rather than a blank panel.
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const envPath = join(root, '.env');
const outPath = join(root, 'apps', 'web', 'src', 'app', 'maps.env.ts');

const env = {};
if (existsSync(envPath)) {
  for (const line of readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (m && !line.trimStart().startsWith('#'))
      env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
}

const cartoApiKey = env.CARTO_BASEMAP_KEY ?? '';

const out = `// AUTO-GENERATED from .env by tools/generate-maps-env.mjs — do not edit by hand.
export const mapsEnv = {
  /**
   * CARTO basemaps API key. Empty leaves the basemap watermarked but working.
   * Public by design — it ships in the tile URL; the domain allow-list is the control.
   */
  cartoApiKey: ${JSON.stringify(cartoApiKey)},
};
`;

writeFileSync(outPath, out);
console.log(
  cartoApiKey
    ? 'maps.env.ts written — CARTO basemap key set.'
    : 'maps.env.ts written — no CARTO_BASEMAP_KEY set, basemap tiles will be watermarked.',
);
