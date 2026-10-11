# Favourites follow the session user, with the server as the source of truth

**Status:** Accepted
**Area:** [seeker-account](../../area/seeker-account.md)

## Context

Trello #105: favourite hearts read `FavoritesStore`, a localStorage list (`hh:favorites`) that was never loaded from `GET /api/favourites`, never cleared on sign-out, and kept a flipped heart when the write failed, because `FavouritesApi` swallowed write errors with `catchError(() => of(null))`. A second device showed the wrong hearts and a shared browser showed the previous user's.

## Decision

- **The store owns the session hook.** `FavoritesStore` runs an effect on `SessionStore`'s user **id**. When the id changes, it empties the list and reloads it from the server; when there is no user, it empties the list and deletes the cache. This covers sign-in, Google, invitation, restore, sign-out and the 401 handler, because every one of them goes through `SessionStore.setSession` / `clear`.
- **Key on the id, not the user object.** Restore confirmation and `refreshSession` re-set the same user, and that must neither wipe the hearts nor fetch them again.
- **Owner-scoped cache.** The cache holds `{ owner, items }` and is read synchronously in the constructor, so it is shown only to the same user. The store is created lazily, so an effect alone cannot undo a sign-out that happened before the store existed. A root effect's first run is also scheduled, not immediate.
- **Writes are optimistic and roll back exactly.** A per-hostel in-flight lock ignores repeat clicks. The load merges in-flight writes and writes that settled during it. After any non-401 write failure the list quietly reloads, so the server decides the heart whatever code it returned.
- **Guests never reach the store.** Every heart surface sends a signed-out visitor to `/auth?mode=login&returnUrl=…`, as the listing page already did.

## Alternatives rejected

- **Hooks in `AuthService` sign-in / sign-out.** Every sign-in path, plus the 401 handler in `provide-auth.ts`, would need a call, and a missed one brings the bug back.
- **Clearing favourites from `SessionStore.clear()`.** That couples the session to a feature. `HostPropertyStore` already follows the session with its own effect (`services/host-property-store.ts`).
- **Treating 409/422 on mark and 404 on unmark as success.** The backend's codes for a duplicate write were unknown and could not be checked while the API was down. Reloading after a failure is correct whatever the codes are.
- **Saving locally while signed out and merging at sign-in.** On a shared browser that would push another person's picks into an account. A guest-save-then-sign-in flow is a separate feature.

## Consequences

- A reload with a token but no cached user starts with no user until validation finishes. The cache is then dropped, and the hearts fill only when the load lands: correct, but not instant.
- The same per-user-cache shape was fixed in two more places: `hh:onboarding:draft`, with eager creation added — see [the become-a-host draft belongs to the signed-in user](../public-content/onboarding-draft-belongs-to-the-session-user.md) — and `HostPropertyStore`'s direct A→B switch, with owner-gated public signals — see [the host's hostel list and selection follow the signed-in user](../host-console/host-property-follows-the-session-user.md). The notification bell is still keyed on the signed-in flag (Trello #123).

## Evidence

- `apps/web/src/app/util/favorites-store.ts`, `apps/web/src/app/services/favourites-api.ts`, `apps/web/src/app/features/public/search/listing-card/listing-card.ts`, `apps/web/src/app/features/public/search/search-map/search-map.ts`, `apps/web/src/app/features/user/favorites/favorites.ts`
- `apps/web/src/app/util/favorites-store.spec.ts`: with the pre-fix store and API restored, 36 of its and `favourites-api.spec.ts`'s 45 tests fail
- PR #64 (KratosvsEzio/hostelhive-FE), run notes `docs/implement/Bugs/105.md`
