# Server renders name the visitor to the API's rate limiter

**Status:** Accepted
**Area:** [ssr-seo-and-prerender](../../area/ssr-seo-and-prerender.md)

## Context

The API limits `/public/*` per IP (60/min, 2,000/day) against scraping (BE PR
azeem-hamza/hostelhive#60). Server renders call `/public/*` from this server's IP for every visitor,
so the API would count the whole site as one client. The limit stays off until the renderer sends
`X-SSR-Secret` and `X-SSR-Client-IP` (Trello #178). When this was built, the SSR app was not
deployed anywhere: hostelhive.com was a GoDaddy Website Builder page, so no platform's client-IP
header could be relied on.

## Decision

- `server.ts` reads `SSR_SHARED_SECRET` and resolves the visitor IP as Express's `req.ip` under
  `app.set('trust proxy', SSR_TRUST_PROXY)` (a hop count, default 0). It passes both to each render
  as `REQUEST_CONTEXT`.
- `ssrApiHeadersInterceptor` (in `app.config.ts`, between `errorInterceptor` and
  `ssrTimeoutInterceptor`) adds the two headers to calls to `${baseUrl}/public/` only, and only when
  the context exists. No secret means neither header.
- A 429 on such a call answers the page 503 with `Retry-After` and `no-store`.

## Alternatives rejected

- **The leftmost `X-Forwarded-For` entry** (the card's wording). The visitor writes it, so a scraper
  could name any IP and escape its limit. A right-counted hop count can't be forged.
- **A platform header such as `CF-Connecting-IP`.** No platform was chosen; a hop count works behind
  any proxy chain and is one env var to set.
- **Reading `process.env` in the interceptor.** It works, since the value is runtime-only, but it puts
  the variable's name in a file the browser bundle is built from, and the next edit could read it at
  build time. Keeping every read in `server.ts` makes the boundary a one-line spec.
- **Registering the interceptor in `app.config.server.ts` only.** That needs a second
  `provideHttpClient`, which drops `withFetch()` and puts the interceptor after
  `ssrTimeoutInterceptor`. The shared interceptor is a no-op in the browser instead.
- **Treating a 429 like any 4xx.** The page would go out as a 200 with an error state, which a cache
  could keep serving after the limit lifts.

## Consequences

- Deploy order: set the same `SSR_SHARED_SECRET` on the API and the SSR server, set
  `SSR_TRUST_PROXY` for the platform's proxy chain, then ship (`docs/DEPLOY.md`).
- A wrong hop count fails silently in one of two directions. Check real visitor IPs in the API's
  logs after the first deploy.
- The header *names* are in the browser bundle (the interceptor ships there); the secret is not.
