import {
  AngularNodeAppEngine,
  createNodeRequestHandler,
  isMainModule,
  writeResponseToNodeResponse,
} from '@angular/ssr/node';
import express from 'express';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const serverDistFolder = dirname(fileURLToPath(import.meta.url));
const browserDistFolder = resolve(serverDistFolder, '../browser');

const DEV_HOSTS = ['localhost', '127.0.0.1', '[::1]', '::1'];

/**
 * Resolves the hostnames the SSR engine will render for, from `NG_ALLOWED_HOSTS`.
 *
 * The engine's SSRF guard rejects every hostname when the allowlist is empty and quietly
 * falls back to client-side rendering, so an unset variable is fatal in production rather
 * than a per-request log line nobody reads. Development falls back to loopback hosts.
 */
function resolveAllowedHosts(): string[] {
  const fromEnv = (process.env['NG_ALLOWED_HOSTS'] ?? '')
    .split(',')
    .map((h) => h.trim())
    .filter(Boolean);
  if (fromEnv.length) return fromEnv;
  if (process.env['NODE_ENV'] === 'production') {
    console.error(
      '[SSR] FATAL: NG_ALLOWED_HOSTS is not set. Every server-rendered route would ' +
        'silently degrade to client-side rendering. Set NG_ALLOWED_HOSTS to the public ' +
        'hostname(s), e.g. NG_ALLOWED_HOSTS=hostelhive.pk,www.hostelhive.pk',
    );
    process.exit(1);
  }
  console.warn(
    `[SSR] NG_ALLOWED_HOSTS not set — defaulting to ${DEV_HOSTS.join(', ')} (dev only).`,
  );
  return DEV_HOSTS;
}

const allowedHosts = resolveAllowedHosts();

const app = express();
const angularApp = new AngularNodeAppEngine({ allowedHosts });

console.log(`[SSR] allowedHosts: ${allowedHosts.join(', ')}`);

/**
 * Example Express Rest API endpoints can be defined here.
 * Uncomment and define endpoints as necessary.
 *
 * Example:
 * ```ts
 * app.get('/api/**', (req, res) => {
 *   // Handle API request
 * });
 * ```
 */

/**
 * Serve static files from /browser
 */
app.use(
  express.static(browserDistFolder, {
    maxAge: '1y',
    index: false,
    redirect: false,
  }),
);

/**
 * Handle all other requests by rendering the Angular application.
 */
app.use('/**', (req, res, next) => {
  angularApp
    .handle(req)
    .then((response) =>
      response ? writeResponseToNodeResponse(response, res) : next(),
    )
    .catch(next);
});

/**
 * Start the server if this module is the main entry point, or it is ran via PM2.
 * The server listens on the port defined by the `PORT` environment variable, or defaults to 4000.
 */
if (isMainModule(import.meta.url) || process.env['pm_id']) {
  const port = process.env['PORT'] || 4000;
  app.listen(port, () => {
    console.log(`Node Express server listening on http://localhost:${port}`);
  });
}

/**
 * Request handler used by the Angular CLI (for dev-server and during build) or Firebase Cloud Functions.
 */
export const reqHandler = createNodeRequestHandler(app);
