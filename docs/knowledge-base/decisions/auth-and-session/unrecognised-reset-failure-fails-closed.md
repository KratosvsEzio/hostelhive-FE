# An unrecognised reset failure fails closed

**Status:** Accepted
**Area:** [auth-and-session](../../area/auth-and-session.md)

## Context
Since BE PR #39, `PATCH /api/user/reset_password` answers with five outcomes:
- 404 "This reset link is invalid or has already been used";
- 403 "This reset link has expired";
- 403 "This account's password can't be reset with a link" (admin and moderator accounts);
- 422 for a blank password;
- 200 on success.

The two 403s share a status and the envelope carries no machine code. The page used to show the server's English text and a toast on top of it. Trello #148.

## Decision
- **Classify, never echo.** `classifyResetFailure` returns `linkInvalid`, `linkExpired`, `accountNotResettable`, `passwordRejected`, `network` or `unknown`, and the page shows only translated keys. `err.message` is never read.
- **Matching rules.**
  - The 403s are matched on the joined, normalised `serverMessages`: an exact match first, then keywords.
  - A 403 that matches **neither or both** sets of keywords is `unknown`, which shows the generic inline message with the form kept.
  - A 404 is `linkInvalid` only when it carries a backend message other than a bare "Not Found".
- **What each panel offers.**
  - Expired, used or invalid: **Request new link**, which goes to forgot-password.
  - Admin or moderator: **Contact us** (`/contact`) and **Back to login**, with no new-link button. That user chose this on 2026-10-11.
- **No toast.** `AuthApi.resetPassword` passes `inlineErrors()`.

## Alternatives rejected
- **Treat any unrecognised 403 as expired.** The product manager proposed this as the friendlier default. It would send an admin round a loop of links that can never work, and it would hide a backend change.
- **Show the server's text.** It is English-only, and a body that isn't the error envelope falls back to Angular's message, which contains the API URL.

## Consequences
- **Rewording breaks classification quietly.** If the backend rewords both 403 messages, users see "Something went wrong" until the classifier is updated. Machine codes were requested from the backend developer.
- **Forgot-password is the next screen to fix.** "Request new link" leads there, and it still shows raw text (Trello #150).

## Evidence
- `apps/web/src/app/features/auth/reset-password/reset-failure.ts`, `reset-password.ts` and `.html`
- `reset-failure.spec.ts`, `reset-password.spec.ts`, `apps/web/src/app/core/i18n/reset-password-locale-parity.spec.ts`
- PR #114 (KratosvsEzio/hostelhive-FE); run notes `docs/implement/Bugs/148.md`
- Live LAN backend: a made-up token returns 404 and the page shows its panel, checked on 2026-10-11.
