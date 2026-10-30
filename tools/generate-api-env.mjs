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
const indexPath = join(root, 'apps', 'web', 'src', 'index.html');

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
  checkPreconnect(apiUrl);
}

// index.html preconnects to the API host by hand (it is not templated). Warn when a deployed
// API_URL names another origin: the tag would then warm a socket the app never uses. Plain
// http is a local or LAN backend, which the production tag is not meant to match.
function checkPreconnect(apiUrl) {
  if (!apiUrl.startsWith('https://') || !existsSync(indexPath)) return;
  const m = readFileSync(indexPath, 'utf8').match(
    /<link\s+rel="preconnect"\s+href="([^"]+)"\s+crossorigin="use-credentials"/,
  );
  const apiOrigin = new URL(apiUrl).origin;
  if (!m) {
    console.warn(`WARNING: index.html has no use-credentials preconnect for the API (${apiOrigin}).`);
  } else if (new URL(m[1]).origin !== apiOrigin) {
    console.warn(
      `WARNING: index.html preconnects to ${m[1]} but API_URL is ${apiOrigin}. ` +
        'Update the API <link rel="preconnect"> in apps/web/src/index.html.',
    );
  }
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
