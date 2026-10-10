# Moderators edit listings through the host's hostel form, not a review-only copy

**Status:** Accepted
**Area:** [admin-and-moderation](../../area/admin-and-moderation.md)

## Context
The moderator review screen had drifted into a second, narrower copy of the host's hostel form. It had no contact fields, no billing cycle or currency, and room types that saved four of their ten columns. A moderator was correcting a listing through a smaller window than the host had filled in.

## Decision
- `Review` renders `<hh-hostel-form>`. The form stops deciding where its data comes from: `options` and `catalogue` are inputs.
  - The host console passes `/api/hostels/new`.
  - Moderation passes `/api/moderator/hostels/new`, giving two endpoints with one contract.
- `moderating` makes the photo delete control *ask* (a rejection) rather than remove.
- `requireComplete` makes an edit form validate like a draft, because approving means "required means required".
- Photo rejection stays owned by the review screen. It is a message to the host (it carries a reason, the host is told, and it can be undone), not an edit to the hostel. It is tracked separately from what has already been sent to the server.

## Alternatives rejected
- **Keep a staff-specific review form.** This is the copy that drifted: two definitions of the same listing that never knew about each other. The fixes found while merging them were:
  - hidden contact fields
  - a `dirty()` check that ignored room types
  - "Sold as" options that dropped the answer
- **Let the form own photo rejection.** The form has no business knowing about messages to the host or about undo.

## Consequences
- Any field added to the hostel form appears in moderation automatically. A staff-only behaviour has to go behind `moderating` or `requireComplete`, not into a fork.
- `apps/web/src/app/features/moderator/review/review.ts` shrank from 969 to 408 lines when this landed.

## Evidence
- `apps/web/src/app/features/moderator/review/review.ts` — `hostelForm` viewChild, `rejectedPhotos` / `rejectionsSent` doc comments.
- `apps/web/src/app/features/host/hostel-form/hostel-form.ts` — `moderating`, `requireComplete` inputs.
- `apps/web/src/app/services/moderation-api.ts` — `formOptions` doc comment.
- Commit 2b679d6 "feat(forms): one hostel form for both consoles, and stop lying to the user"; PR #33 "Booking without payment, one hostel form for both consoles".
