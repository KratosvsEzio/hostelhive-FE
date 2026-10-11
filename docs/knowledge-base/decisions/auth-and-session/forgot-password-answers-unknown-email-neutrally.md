# Forgot password answers an unknown email neutrally

**Status:** Accepted
**Area:** [auth-and-session](../../area/auth-and-session.md)

## Context
`POST /api/user/forgot_password` answers a known email with 201, or 422 while a link is still live (10 minutes). An unknown email crashes with a 500 (`sessions_controller.rb:87` calls `user.id` before the nil check; confirmed live on 2026-10-11). Once fixed as written, it would return 404 "User does not exist".

The page used to show the server's text for all of these. Trello #150 asked for translated copy and flagged account enumeration.

## Decision
- **The sent screen is neutral:** "If an account exists for {{email}}, we've sent a link to reset your password. Check your inbox and spam folder." It is one key, with the address bound as text and bidi-isolated. It replaced the two sentence fragments `weSentAPasswordReset` and `clickTheLinkInThe`.
- **A 404 that carries backend text shows the same sent screen as a 201**, ready for the backend fix. A bare Rails "Not Found" does not.
- **A 500, a bare 404 or 422, and any other status stay on the form** with "We couldn't send a reset link. Check the email address and try again." This fails closed: a real outage must never tell people to wait for an email. Today this is also what an unknown email shows, and "check the address" helps someone who mistyped.
- **A 422 goes to the sent screen with an "already sent" notice** (`role="status"`), not a form error. Nothing is wrong with the input, and staying on the form invites retries that hit the 429 (5 per 5 minutes per IP).
- **"Use a different email"** on the sent screen offsets the cost of neutral copy for typos.
- The user chose all of these on 2026-10-11.

## Alternatives rejected
- **Say "No account with that email" with a Sign up link.** It is the most helpful for typos, but it reveals which emails have accounts. On a hostel marketplace that can reveal something about a person, for example a student looking for housing away from home.
- **One generic error for 404 and 500, keeping the old "We sent a link to X" copy.** The Principal Engineer's option A. It needs no copy change now, but the neutral copy would then wait for a backend fix, and the fragments translated badly.
- **Treat a 500 as sent.** Rejected: an outage would look like success.

## Consequences
- **The page alone does not stop enumeration.** The API's status codes, the "already sent" notice (only real accounts get a 422), sign-in's "User not found" and sign-up's "already registered" all still reveal accounts. The real fix is for the backend to return the same 201 for any email; that has been asked of the BE developer.
- **When the backend returns 201 for unknown emails, the FE needs no change.** The 404 mapping then becomes dead and can be removed.
- `retry_after` is not shown: the interceptor drops it and CORS doesn't expose `Retry-After`. The copy says "a few minutes".

## Evidence
- `apps/web/src/app/features/auth/forgot-password/forgot-failure.ts`, `forgot-password.ts` and `.html`
- `forgot-failure.spec.ts`, `forgot-password.spec.ts`, `apps/web/src/app/core/i18n/forgot-password-locale-parity.spec.ts`
- PR #123 (KratosvsEzio/hostelhive-FE); run notes `docs/implement/Bugs/150.md`
