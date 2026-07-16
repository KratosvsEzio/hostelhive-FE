// Reads the repo-root `.env` and writes `apps/web/src/app/google-oauth.env.ts`, so the
// Angular build compiles the Google OAuth 2.0 Client ID into the bundle.
//
// Runs automatically before `nx build web` / `nx serve web` / `nx run web:build-mobile`
// (project.json dependsOn), or manually: `node tools/generate-google-oauth-env.mjs`.
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

const clientId = env.GOOGLE_OAUTH_CLIENT_ID ?? '';

const out = `// AUTO-GENERATED from .env by tools/generate-google-oauth-env.mjs — do not edit by hand.
export const googleOAuthEnv = {
  clientId: ${JSON.stringify(clientId)},
};
`;

writeFileSync(
  join(root, 'apps', 'web', 'src', 'app', 'google-oauth.env.ts'),
  out,
);
console.log(`google-oauth.env.ts written — clientId ${clientId ? 'SET' : 'EMPTY (Google sign-in will not work)'}.`);
