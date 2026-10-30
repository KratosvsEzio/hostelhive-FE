# Deploying the `web` app (Angular SSR)

`web` is a server-side-rendered Angular app. `npx nx build web` emits a self-contained
Node/Express server plus the browser bundle:

```
dist/apps/web/
  browser/           # static client assets, served with a 1-year max-age
  server/server.mjs  # the Express entry point
```

Run it with:

```bash
NG_ALLOWED_HOSTS=hostelhive.pk,www.hostelhive.pk PORT=4000 \
  NODE_ENV=production node dist/apps/web/server/server.mjs
```

## Environment variables

| Variable           | Required              | Default               | Purpose                                                                |
| ------------------ | --------------------- | --------------------- | ---------------------------------------------------------------------- |
| `NG_ALLOWED_HOSTS` | **Yes in production** | loopback hosts in dev | Comma-separated hostnames the SSR engine will render for.              |
| `PORT`             | No                    | `4000`                | Port Express listens on.                                               |
| `NODE_ENV`         | No                    | —                     | `production` makes a missing `NG_ALLOWED_HOSTS` a fatal startup error. |
| `SSR_SHARED_SECRET` | **Yes once the API sets it** | unset          | Sent as `X-SSR-Secret` on server-side `/public` calls. Must equal the API's value. |
| `SSR_TRUST_PROXY`  | **Yes behind a proxy** | `0`                  | Number of proxies in front of the server; picks the visitor IP sent as `X-SSR-Client-IP`. |

### `SSR_SHARED_SECRET` and `SSR_TRUST_PROXY`: per-visitor API limits

The API limits `/public/*` per visitor IP (60/min, 2,000/day) against scraping. Server renders
call `/public/*` from this server's IP for every visitor, so on each such call the server sends:

- `X-SSR-Secret`: `SSR_SHARED_SECRET`. The API trusts the next header only when this matches.
- `X-SSR-Client-IP`: the visitor's IP, from Express's `req.ip` under `SSR_TRUST_PROXY`.

Only `/public/*` on the API gets them, and only from the server. Browser calls are unchanged
and carry the visitor's own IP. The secret is read in `server.ts` alone and never reaches the
browser bundle (`ssr-secret-boundary.spec.ts` fails if any other file names it).

**Deploy order.** Set the same `SSR_SHARED_SECRET` on the API and on this server, then ship.
Unset, the server logs a warning and sends neither header, and the API counts every visitor as
this server.

**Set `SSR_TRUST_PROXY` to the number of proxies between the internet and Node.** Express then
reads `X-Forwarded-For` from the **right**, skipping that many entries, which a visitor cannot
forge. Never take the leftmost entry: the visitor writes it.

| In front of Node                                      | `SSR_TRUST_PROXY` |
| ----------------------------------------------------- | ----------------- |
| Nothing (Node faces the internet)                     | `0`               |
| One reverse proxy or load balancer (e.g. nginx)       | `1`               |
| A CDN in front of that proxy (e.g. Cloudflare → nginx) | `2`              |

A managed platform (Cloud Run, Firebase, a PaaS router) may add more than one entry. The
hosting platform is not chosen yet, so confirm its count from its docs or from a logged
`X-Forwarded-For` before going live.

Too low and every visitor shares the proxy's IP, so the whole site is throttled as one client.
Too high and a visitor can name any IP. Check it once after deploy: the API's logs should show
real visitor IPs on `/public` calls, not the proxy's. A value that is not a whole number stops
the server under `NODE_ENV=production`; the startup log prints `[SSR] trust proxy hops: N`.

**A rate-limited render answers 503.** If the API answers a server-side `/public` call with 429,
the page goes out as `503` with `Retry-After` and `Cache-Control: no-store`, so no cache keeps
the error. The browser fetches the data again on hydration.

### `NG_ALLOWED_HOSTS` is not optional

`@angular/ssr` validates the request hostname to block server-side request forgery. The
allowlist is **empty in the build manifest** — nothing sets `security.allowedHosts`, and
nothing should, because that value is baked at build time and cannot vary per environment.

An empty allowlist means _every_ hostname is rejected. When that happens the engine does
not fail loudly: it logs one error and serves the bare client-side shell instead. Every
server-rendered route silently degrades to client-side rendering — no server-rendered
markup, no per-route `<title>`, no SEO. A response of roughly 19 KB where you expected a
few hundred KB is the tell.

`npx nx serve web` never shows this because the Angular dev server injects its own host
into the allowlist automatically. It is a deployment-only failure mode.

So on startup the server resolves the allowlist once and logs it. Under
`NODE_ENV=production` a missing `NG_ALLOWED_HOSTS` aborts the boot with a non-zero exit
code rather than serving degraded pages. Outside production it falls back to `localhost`,
`127.0.0.1` and `[::1]` and warns.

Do not use `*` — it disables the guard the allowlist exists for.

### Once the allowlist is non-empty, an unknown host is a hard 400

The silent CSR fallback only happens while the allowlist is _empty_. As soon as it has one
entry — from any source — a request whose hostname is not on it gets `400 Bad Request`
instead. So a typo'd or incomplete `NG_ALLOWED_HOSTS` is a total outage, not a degradation.
That is the safer failure (it is loud, and it is the documented behaviour for a future
major), but it means the value has to be right. The startup log line

```
[SSR] allowedHosts: hostelhive.pk, www.hostelhive.pk
```

is there to be checked against the domains actually in use before traffic is cut over.

### Behind a reverse proxy, allow the PUBLIC hostname

The engine validates `Host` **and** `X-Forwarded-Host`, and reconstructs the request URL
from `X-Forwarded-Host` / `X-Forwarded-Proto` / `X-Forwarded-Port`. Behind nginx, a load
balancer, or a PaaS router, the hostname it sees is therefore the one the browser asked
for — the public domain — not `localhost`, even though the proxy connects over loopback.

```
NG_ALLOWED_HOSTS=hostelhive.pk,www.hostelhive.pk   # correct
NG_ALLOWED_HOSTS=localhost                          # degrades every request to CSR
```

List every public hostname that reaches the app, including staging domains and any
`www.` variant. If the proxy does not forward the original host, configure it to send
`X-Forwarded-Host` (nginx: `proxy_set_header X-Forwarded-Host $host;`).

## Rendering modes

Render modes live in `apps/web/src/app/app.routes.server.ts`. The public seeker pages are
prerendered or server-rendered; the authenticated areas (`/host`, `/admin`, `/moderator`,
`/account`) are `RenderMode.Client`, because there is no session on the server and
rendering them there would bake a signed-out or errored view into the HTML.
