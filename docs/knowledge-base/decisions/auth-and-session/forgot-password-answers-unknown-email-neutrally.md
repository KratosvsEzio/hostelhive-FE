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
- **The backend is neutral now too** (BE PR #61, per Trello #179; not probed live from the FE). Every address gets the same 201, and a repeat within 10 minutes gets a 422 for every address, so the "already sent" notice no longer singles out real accounts. Sign-in answers an unknown email with the same 401 as a wrong password. Sign-up's "already registered" still reveals accounts.
- **The 404 mapping is dead, and kept on purpose** (user, 2026-10-31, Trello #179). If the backend ever regressed to a 404 for unknown emails, the page would still look "sent" instead of saying "couldn't send".
- **Resend waits 10 minutes after a send, with a live countdown** (Trello #179). The wait is kept per address (trimmed, lower-cased), in memory only. A 422 with no local send of its own waits the whole 10 minutes. A 422 after the countdown ran out means the clocks drifted, so it waits one more minute. Sending again to an address still inside its window skips the request and shows the sent screen with the "already sent" notice, because the request could only earn a 422 and would spend one of the 3/hour attempts for that email.
- **A 429 shows "Try again in m:ss"** from `ApiError.retryAfter`, which `errorInterceptor` reads from the body's `retry_after` (CORS hides `Retry-After`). Send or Resend stays disabled for that address until the wait ends; a 429 without `retry_after` keeps the "a few minutes" copy. The alert announces the wait once, as it arrived; the ticking copy beside it is `aria-hidden`.
- Times are written as a clock (`9:59`, `1:00:00` from an hour up), because the app has no plural rules. The global 429/413 handling is Trello #180. `forgotPassword` sends `inlineErrors()`, so the interceptor does not toast its failures, and #180 must respect `SUPPRESS_ERROR_TOAST` or this page shows its 429 twice.

## Evidence
- `apps/web/src/app/features/auth/forgot-password/forgot-failure.ts`, `forgot-password.ts` and `.html`
- `forgot-failure.spec.ts`, `forgot-password.spec.ts`, `apps/web/src/app/core/i18n/forgot-password-locale-parity.spec.ts`
- PR #123 (KratosvsEzio/hostelhive-FE); run notes `docs/implement/Bugs/150.md`
- The waits and the 429: `forgot-password.ts` (`Waits`, `recordAlreadySent`, `clock`), `apps/web/src/app/core/interceptors/error-interceptor.ts` (`retryAfterOf`), `apps/web/src/app/core/errors/api-error-text.ts` (`retryAfterSeconds`); run notes `docs/implement/179.md`
