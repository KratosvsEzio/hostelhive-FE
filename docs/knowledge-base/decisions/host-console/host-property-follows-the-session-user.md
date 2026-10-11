# The host's hostel list and selection follow the signed-in user

**Status:** Accepted
**Area:** [host-console](../../area/host-console.md)

## Context

Trello #115: `HostPropertyStore` cleared the host's hostel list and selection only when the session went from signed in to signed out (an effect on `isAuthenticated()`). An account switch without a sign-out — opening an account-confirmation link while someone else is signed in (`/confirm_invitation` → `AuthService.establishSession` → `setSession(B)`), or a restore that resolves to a different user — left the previous host's hostels in place. The console guards trusted that list: `hostRootRedirect` sent the new user to `/host/<previous host's hostel>`, `knownHostelGate` admitted it, and the billing gates decided on the wrong hostel. The persisted selection (`hh_property`) had no owner either.

## Decision

- **Gate the public signals on the owner, not just an effect.** The store keeps one private state stamped with the user it was loaded for; `properties`, `hostels` and `loaded` are computeds that read as nothing loaded when that owner is not `SessionStore.user()?.id`. The guards read `loaded()` synchronously while root effects are scheduled, so an effect alone would leave a window in which they trust the previous user's list; with the gate they see `loaded() === false` in the same tick as the switch and call `load()` themselves. No guard changed.
- **An effect does the clean-up**, keyed on a `holder` as in the onboarding-draft store: sign-out clears; a different user cancels the previous request, resets the selection and drops a saved entry the new user doesn't own; a token-only restore and a same-user refresh do nothing. `load()` stamps who it fetched for and drops a late response for anyone else.
- **Reload after a switch only when a request was in flight** — the only case a guard can be waiting on it. A list that had finished loading is not refetched, so a seeker replacing a host never calls `GET /api/host/hostels`.
- **Owner-scoped persistence under a new key**, `hh:host-property` = `{ owner, id }`. A bare id saved by older builds under `hh_property` is adopted once by whoever is signed in (user decision: it holds no personal data and `load()` checks it against the user's own list).
- **No eager creation.** Unlike the onboarding draft, the saved value is an opaque hostel id that an owner-checked restore never hands to anyone else.

## Alternatives rejected

- **An effect only.** Leaves the same-tick window above.
- **Owner checks in each guard.** One rule spread across four guards (`host.routes.ts`).
- **Hooks in `AuthService` / `SessionStore.clear()`.** Same reasoning as [favourites follow the session user](../seeker-account/favourites-follow-the-session-user.md).
- **Reload after every switch.** Made a seeker who replaced a host call the host endpoint (possible 403 toast).
- **Discard the legacy key.** Would put every multi-hostel host on their first hostel once after the deploy.

## Consequences

- The host shell loads only in its constructor; an account switch while it stays mounted would leave it loading until the next guard runs. No path does that today.
- Two people alternating on one browser each lose their saved selection, since a restore drops the other user's entry.
- The frontend never volunteers another host's hostel id, but a bookmarked `/host/<id>` with a failed list load still reaches the API; the server must refuse it (Trello #126).

## Evidence

- `apps/web/src/app/services/host-property-store.ts`; guards in `apps/web/src/app/features/host/host.routes.ts`
- `apps/web/src/app/services/host-property-store.spec.ts`, `apps/web/src/app/features/host/host.routes.spec.ts`: with the pre-fix store restored, all 14 cause tests fail (incl. `/host` → the previous host's hostel) and every guard test passes
- PR #80 (KratosvsEzio/hostelhive-FE), run notes `docs/implement/Bugs/115.md`
