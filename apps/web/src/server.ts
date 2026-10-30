import {
  AngularNodeAppEngine,
  createNodeRequestHandler,
  isMainModule,
  writeResponseToNodeResponse,
} from '@angular/ssr/node';
import express from 'express';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { SsrApiContext } from './app/core/interceptors/ssr-api-headers-interceptor';
import { renderRobotsTxt } from './app/core/robots';
import { SITE_ORIGIN } from './app/core/seo';
import { normaliseClientIp, parseTrustProxy } from './app/core/ssr-client-ip';
import {
  renderSitemap,
  sitemapPaths,
} from './app/features/public/landing/sitemap-urls';

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

/**
 * How many proxies stand in front of this server, from `SSR_TRUST_PROXY` — see
 * `parseTrustProxy`. A value that is not a whole number is fatal in production: guessing
 * too many hops lets a visitor forge their IP, too few makes every visitor one client.
 */
function resolveTrustProxy(): number {
  const hops = parseTrustProxy(process.env['SSR_TRUST_PROXY']);
  if (hops !== null) return hops;
  console.error(
    `[SSR] SSR_TRUST_PROXY must be a whole number of proxy hops, got ` +
      `"${process.env['SSR_TRUST_PROXY']}". Using 0 (the TCP peer address).`,
  );
  if (process.env['NODE_ENV'] === 'production') process.exit(1);
  return 0;
}

/**
 * The secret the API checks before it trusts `X-SSR-Client-IP`. Read here, and only here, so
 * no file the browser bundle is built from ever touches it. Unset is a working state: the
 * API then counts the renderer as one client, which is how it behaved before.
 */
function resolveSsrSecret(): string | null {
  const secret = process.env['SSR_SHARED_SECRET']?.trim() || null;
  if (!secret) {
    console.warn(
      '[SSR] SSR_SHARED_SECRET not set — server-side /public API calls go out without ' +
        'X-SSR-Secret, so the API counts every visitor as this server.',
    );
  }
  return secret;
}

const allowedHosts = resolveAllowedHosts();
const trustProxy = resolveTrustProxy();
const ssrSecret = resolveSsrSecret();

const app = express();
app.set('trust proxy', trustProxy);
const angularApp = new AngularNodeAppEngine({ allowedHosts });

console.log(`[SSR] allowedHosts: ${allowedHosts.join(', ')}`);
console.log(`[SSR] trust proxy hops: ${trustProxy}`);

/**
 * `/sitemap.xml` — served here rather than committed as a static file so it cannot drift
 * from the routes it describes: the URLs are derived from the same `PLACES` list the
 * landing pages are built from, so adding a place adds its sitemap entry.
 *
 * Declared before `express.static` so it wins outright, rather than depending on there
 * being no file of that name in the build output.
 *
 * No `lastmod`, `changefreq` or `priority`. Google ignores the latter two outright, and a
 * `lastmod` set to the build time would claim every page changed on every deploy — a
 * signal treated as untrustworthy and discounted, which is worse than omitting it.
 */
app.get('/sitemap.xml', (_req, res) => {
  res
    .type('application/xml')
    // An hour: the URL set only changes when a place is added, which is a deploy.
    .set('Cache-Control', 'public, max-age=3600')
    .send(renderSitemap(SITE_ORIGIN, sitemapPaths()));
});

/**
 * `/robots.txt` — generated for the same reason as the sitemap: its rules are written per
 * language from `LOCALE_CODES`, so a new language is covered without anyone remembering
 * this file. The static file it replaces listed bare paths only, and stopped matching any
 * real URL the day every URL gained a language prefix.
 */
app.get('/robots.txt', (_req, res) => {
  res
    .type('text/plain')
    .set('Cache-Control', 'public, max-age=3600')
    .send(renderRobotsTxt(SITE_ORIGIN));
});

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
 *
 * Each render gets the shared secret and this visitor's IP through `REQUEST_CONTEXT`, which
 * `ssrApiHeadersInterceptor` turns into headers on the render's `/public` API calls.
 */
app.use('/**', (req, res, next) => {
  const context: SsrApiContext = { ssrSecret, clientIp: normaliseClientIp(req.ip) };
  angularApp
    .handle(req, context)
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
