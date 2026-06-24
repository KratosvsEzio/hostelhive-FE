// Reads the repo-root `.env` and writes `apps/web/src/app/google-maps.env.ts`, so the
// Angular build (which can't read `.env` at runtime — there's no process.env in the
// browser) compiles the Maps JS key into the bundle.
//
// Runs automatically before `nx build web` / `nx serve web` (project.json dependsOn),
// or manually: `node tools/generate-google-maps-env.mjs`.
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const envPath = join(root, '.env');

const env = {};
if (existsSync(envPath)) {
  for (const line of readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (m && !line.trimStart().startsWith('#'))
      env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
}

const apiKey = env.GOOGLE_MAPS_API_KEY ?? '';
const mapId = env.GOOGLE_MAPS_MAP_ID || 'DEMO_MAP_ID';

const out = `// AUTO-GENERATED from .env by tools/generate-google-maps-env.mjs — do not edit by hand.
export const googleMapsEnv = {
  apiKey: ${JSON.stringify(apiKey)},
  mapId: ${JSON.stringify(mapId)},
};
`;

writeFileSync(
  join(root, 'apps', 'web', 'src', 'app', 'google-maps.env.ts'),
  out,
);
console.log(
  `google-maps.env.ts written — apiKey ${apiKey ? 'SET' : 'EMPTY'}, mapId ${mapId}.`,
);
