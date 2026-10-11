# A confirmation link asks before it replaces a signed-in session

**Status:** Accepted
**Area:** [auth-and-session](../../area/auth-and-session.md)

## Context
`/confirm_invitation?token=…` exchanges an emailed one-time token for a JWT. It used to spend the token as soon as the page rendered, silently replacing whoever was signed in on that browser — with no revoke of the previous token and no push rotation. The common case is a hostel's shared front-desk PC: a host adds a manager by email, and the manager opens the confirmation there while the host (billing, every property) is signed in. Trello #125.

## Decision
- **Ask when any session exists** — `session.accessToken() !== null`, not `isAuthenticated()`, so a token-only restore still waiting for its user is covered. Nothing is sent until the visitor chooses. The prompt names the account as "Name (email)" from `session.user()`, else the cached user, else the JWT payload's `name` / `email` (display only), inside Unicode isolates; it never says "the new account", because A and B can be the same person.
- **Log out and continue** → `AuthService.signOutThenConfirmInvitation(token)`: the real sign-out (best-effort revoke with no toast, clear, `push.rotate()`), **then** the exchange. Kept in the service so the order is a pinned rule, not a page detail. Success lands on `/` with `replaceUrl`, so Back does not reopen the spent link. A failure shows the existing error or "confirmed — please log in" states; the previous account is not restored (the prompt said it would be logged out).
- **Stay signed in** → home; the link is not spent and still works later (it lasts a year).
- **If the session ends on its own while the prompt shows**, the page carries on confirming — there is nothing left to protect, and opening the link was the intent.
- The decision runs in `afterNextRender`: verified to fire on a fresh load of this routed page, and it never runs on the server, so the one-time token is never spent during SSR. `ngAfterViewInit` would run during SSR here.
- No autofocus (a stray Enter must not log anyone out); focus moves to the heading; a `role="status"` region announces the confirming step after a choice.

## Alternatives rejected
- **Revoke the previous account after the new one is seated** (no prompt): the DELETE would need the previous bearer while the new one is seated — a bearer override through three interceptors and the API client — and rotating push then deletes the registration the backend just linked to the new account.
- **Keep asking after the session ended on its own**: leaves a prompt naming an account that is no longer signed in.
- **Wait for startup validation before deciding**: replaced by reading the backend's `expiry` claim, which retires a dead overnight token before the page decides (see [Only a 401 ends a session](only-a-401-ends-a-session.md)).

## Consequences
- After Continue, the confirm POST carries no FCM token (`rotate()` has just cleared it); the backend links the fresh token to the new account on its next authenticated request (BE PR #39, Trello #142 — before that it linked devices only in `issue_token`). The page is effectively web-only anyway — the Android app declares no app links.
- Since BE PR #39 the backend answers an unknown or used confirmation token with 404 and an expired one with 403 (each with a message). Since Trello #149 (PR #119) the page shows a card for each, sorted by `classifyConfirmFailure`. An unknown 404 is usually a re-click after confirming; after "Log out and continue" that signs the user out, so the 404 card says "just log in".
- A revoked-but-unexpired previous token rejected during startup validation still sends the visitor home with the link unspent.

## Evidence
- `apps/web/src/app/features/auth/confirm-invitation/confirm-invitation.ts` and `.html` (phases `verifying | asking | confirmed | error`, the `answered` latch, the session-ended effect)
- `apps/web/src/app/core/auth/auth.service.ts` (`signOutThenConfirmInvitation`, `endSession`), `apps/web/src/app/services/auth-api.ts` (`signOut({ inlineErrors })`), `apps/web/src/app/core/api-resource.ts` (`delete` context)
- `confirm-invitation.spec.ts` and `auth.service.spec.ts`; PR #106 (KratosvsEzio/hostelhive-FE), run notes `docs/implement/Bugs/125.md`
