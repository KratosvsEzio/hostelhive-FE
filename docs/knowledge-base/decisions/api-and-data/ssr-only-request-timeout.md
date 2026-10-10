# Server-side requests time out at 5 s; browser requests never do

**Status:** Accepted
**Area:** [api-and-data](../../area/api-and-data.md)

## Context
An unreachable backend drops packets rather than refusing the connection, so a request stays open until the OS gives up minutes later. Angular counts it in `PendingTasks`, so server rendering never stabilised: every public page used the full 9-second budget and then serialised half-drawn. Nothing in the app had a timeout.

## Decision
`ssrTimeoutInterceptor` applies `timeout(5000)` to every request **on the server only**. It sits last in the chain, closest to the backend, so it measures the network wait, and its `TimeoutError` comes back out through `errorInterceptor` as a normal `ApiError`.

## Alternatives rejected
- **A timeout in the browser too**: the browser can show a spinner, and the user can wait or leave. Cutting a slow request short there would create an error nobody asked for.
- **`Promise.race` instead of `timeout()`** (what `AuthService.restoreSession` does to avoid cancelling): there the response is still wanted after the cap. A server request that missed the render is useless, and keeping its socket open only costs the server.

## Consequences
- With a dead API, a public page renders in about 6 s with an error state instead of 9+ s half-drawn (measured in the commit).
- Nothing is cached from a timeout (the transfer cache only carries successes), so the browser re-fetches on hydration.
- Do not add browser-side timeouts "for consistency".

## Evidence
- `apps/web/src/app/core/interceptors/ssr-timeout-interceptor.ts` and its spec
- `apps/web/src/app/app.config.ts` (chain order)
- 287df9c fix(ssr): stop a dead backend from hanging server-side rendering
