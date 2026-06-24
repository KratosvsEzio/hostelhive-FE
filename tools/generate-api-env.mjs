// Reads the repo-root `.env` and writes `apps/web/src/app/api.env.ts`, so the
// Angular build (which can't read `.env` at runtime — there's no process.env in
// the browser) compiles the API base URL into the bundle.
//
// Runs automatically before `nx build web` / `nx serve web` (project.json dependsOn),
// or manually: `node tools/generate-api-env.mjs`.
// Pass `--watch` to keep running and regenerate on every `.env` save.
import { readFileSync, writeFileSync, existsSync, watch } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const envPath = join(root, '.env');
const outPath = join(root, 'apps', 'web', 'src', 'app', 'api.env.ts');

function generate() {
  const env = {};
  if (existsSync(envPath)) {
    for (const line of readFileSync(envPath, 'utf8').split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
      if (m && !line.trimStart().startsWith('#'))
        env[m[1]] = m[2].replace(/^["']|["']$/g, '');
    }
  }

  const apiUrl = env.API_URL ?? 'http://localhost:3000';

  const out = `// AUTO-GENERATED from .env by tools/generate-api-env.mjs — do not edit by hand.
export const apiEnv = {
  apiUrl: ${JSON.stringify(apiUrl)},
};
`;

  writeFileSync(outPath, out);
  console.log(`api.env.ts written — apiUrl ${apiUrl}.`);
}

// Run once immediately.
generate();

// --watch: re-generate whenever .env changes (Angular dev-server picks up the TS change).
if (process.argv.includes('--watch')) {
  console.log('Watching .env for changes…');
  let debounce;
  watch(envPath, () => {
    clearTimeout(debounce);
    debounce = setTimeout(generate, 100);
  });
}
