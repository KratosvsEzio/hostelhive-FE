# The become-a-host draft belongs to the signed-in user and ends at sign-out or on "Save and continue"

**Status:** Accepted
**Area:** [public-content](../../area/public-content.md)

## Context

Trello #114: the become-a-host wizard kept its progress in localStorage under `hh:onboarding:draft` — the hostel's details, the host's email and phones, and the server `draftId` that "Save and continue" updates. The draft recorded no owner and nothing ever removed it. On a shared browser (family PCs, hostel front desks, cyber cafés — normal for this host base) the next person to open the wizard got the previous host's form, and their save sent `PUT /api/hostels/<previous host's id>`. The same un-ended draft also made a returning host update their earlier hostel instead of starting a new one (RISKS R2).

## Decision

- **One owner of the key.** `OnboardingDraftStore` (`apps/web/src/app/services/onboarding-draft-store.ts`) stores the draft flat as `{ owner, ...fields }` under `SessionStore.user()?.id` and is the only code that reads or writes it. A draft belonging to anyone else, to no one (saved before owners existed) or unreadable is removed on read.
- **Delete at sign-out, don't keep per owner.** When the session fully ends — user and token both gone (sign-out, a 401) — or the user changes, the draft is deleted. A host who signs out mid-form loses an unsaved local draft; a hostel already created survives on the server and in the console.
- **A token-only restore is not a sign-out.** While `restoreSession()` holds startup with a token but no user yet, the draft is left alone, so a host's own draft survives a reload. Unlike favourites there is no server copy to reload it from.
- **Created at startup.** `provideOnboardingDraftCleanup()` (an app initializer in `app.config.ts`) creates the store eagerly, because a sign-out normally happens on a page where no onboarding screen exists — the gap the lazily created `FavoritesStore` and `HostPropertyStore` have.
- **The draft ends when "Save and continue" succeeds.** The hostel then lives on the server and the host continues in its billing page, so the next "List your hostel" starts a new listing. "Save and exit" keeps the draft.

## Alternatives rejected

- **Keep the draft per owner and resume it at the owner's next sign-in.** No loss for the host, but their phone numbers and building location would stay readable on a shared machine; decided against by the user (2026-10-11).
- **Check the owner on read only.** Simpler, but leaves the contact details on disk until someone opens the wizard — the ticket's actual complaint.
- **End the draft at payment success.** Planned first; PR #68 deleted the payment page mid-fix, leaving no such moment.
- **Hook `AuthService` sign-out or `SessionStore.clear()`.** Couples the session to a feature and misses paths such as the 401 handler — the same reasoning as [favourites follow the session user](../seeker-account/favourites-follow-the-session-user.md).
- **Adopt an ownerless legacy draft for the current user.** That is the bug.

## Consequences

- A stale second tab still signed in as A can write A's draft back after A signs out there; it is never shown to anyone else and is removed at the next startup or user change.
- The frontend fix stops the browser sending another user's draft id, but the server is the authority: Trello #118 asks `PUT /api/hostels/:id` to refuse a caller who doesn't own the hostel.

## Evidence

- `apps/web/src/app/services/onboarding-draft-store.ts`, `apps/web/src/app/app.config.ts`, `apps/web/src/app/features/public/onboarding/onboarding-wizard/onboarding-wizard.ts`
- `apps/web/src/app/features/public/onboarding/onboarding-wizard/onboarding-wizard.spec.ts`: against the unfixed wizard (`5b76f57`) exactly its 9 cause tests failed on assertions
- PR #70 (KratosvsEzio/hostelhive-FE), run notes `docs/implement/Bugs/114.md`
