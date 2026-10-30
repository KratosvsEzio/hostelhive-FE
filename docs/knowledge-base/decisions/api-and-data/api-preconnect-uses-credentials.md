# The API preconnect is static, credentialed, and checked against `API_URL` at build time

**Status:** Accepted
**Area:** [api-and-data](../../area/api-and-data.md)

## Context
The first data request is on the critical path to Largest Contentful Paint, and on the client-only console routes nothing server-rendered has opened a connection to the API yet. A `<link rel="preconnect">` saves the DNS, TCP and TLS round trips, but only if it names the host the app calls **and** uses the same credentials mode. Browsers keep credentialed and anonymous sockets in separate pools. `authInterceptor` sends every API call with `withCredentials`, so an anonymous (`crossorigin`) preconnect would warm a socket that no API request reuses (Trello #75).

## Decision
`apps/web/src/index.html` carries `<link rel="preconnect" href="https://api.hostelhive.com" crossorigin="use-credentials">`. The image-bucket preconnect beside it stays anonymous (`crossorigin`), because images are fetched without credentials. `tools/generate-api-env.mjs`, which runs before every `build`, `build-mobile` and `serve`, warns when an `https` `API_URL` names a different origin from the tag. Plain `http` URLs are local or LAN backends and are not checked.

## Alternatives rejected
- **Generating `index.html` from `.env`**: `index.html` is hand-edited source, read by the source-scanning specs and by `serve`. Making it a build output adds a git-ignored copy that every edit has to be regenerated into, all to save one line that changes only when the API moves host.
- **Adding the tag at render time from `apiEnv.apiUrl`**: client-only routes are not server-rendered, so they would never get it. The mobile shell has no server at all.
- **A bare `crossorigin` as the original TODO suggested**: it puts the socket in the wrong pool, as explained above.

## Consequences
- When the API moves host, update the tag. The build warning tells you to.
- A new API call made without credentials would open its own connection. Keep the interceptor's `withCredentials`, or add a second, anonymous preconnect.

## Evidence
- `apps/web/src/index.html`, `tools/generate-api-env.mjs`
- `apps/web/src/app/core/interceptors/auth-interceptor.ts` (`withCredentials` on every API request)
- `apps/web/src/app/core/seo.spec.ts` (`index.html` preconnect modes)
