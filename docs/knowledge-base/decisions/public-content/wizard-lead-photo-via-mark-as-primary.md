# The wizard saves the lead photo through mark_as_primary, after the save that links it

**Status:** Accepted
**Area:** [public-content](../../area/public-content.md)

## Context

The become-a-host wizard lets the host star one uploaded photo as the lead photo (`media()` items with `primary: true`). It sent that choice only as `banner_id` in the `POST`/`PUT /api/hostels` payload. The backend has no `banner_id` field, so `hostel_params` dropped it silently. The backend also never sets `is_primary` on its own, so every hostel created through the wizard had no lead photo.

The backend's only way to set it is `PUT /api/attachments/:id/mark_as_primary` (no body). Its `authenticate_host!` takes the hostel from the attachment's `attached` record only when `attached_type == "Hostel"` and returns 403 otherwise (`app/controllers/api/attachments_controller.rb` in azeem-hamza/hostelhive, branch `main`). An uploaded photo is attached to the hostel by the `attachment_ids` of a hostel save, so it cannot be starred before then.

## Decision

- **A separate call after the hostel save.** Both "Save and continue" and "Save and exit" call `markPrimary()` once the create or update succeeds and its ids are recorded as linked. This matches the host console, which sends the star after `HostelsApi.update` in `hostel-profile.ts`.
- **Only for a linked photo.** `markPrimary()` sends nothing when the starred photo has no `attachmentId`, or when its id is not in `linkedAttachmentIds`. A rejected save links nothing, so it marks nothing.
- **Not re-sent unchanged.** `markedPrimaryId` holds the last id the server accepted. A save with the same star sends no call; moving the star sends one. It is not part of the device draft, so a restored draft re-sends the star once, which is harmless.
- **Before leaving the page.** The call is chained ahead of the session refresh and the navigation, because leaving destroys the wizard and `takeUntilDestroyed` would cancel it.
- **Best effort.** The hostel is already saved, so a failed mark is swallowed: the host still leaves and no error is shown. The id is not recorded, so the next "Save and exit" tries again.

## Alternatives rejected

- **Keep `banner_id` in the payload.** The backend has no such field. PR #79 removed it from the hostel payloads.
- **Mark the photo as soon as it is starred, as the console does for photos already on the hostel.** A wizard photo is not linked until a save, so the call would 403.
- **Fail the save when marking fails.** The hostel would already exist on the server, and the host would be stuck on a form that cannot undo that.

## Consequences

- "Save and continue" ends the device draft, so a mark that fails there is not retried. The host has to star the photo again in the host console.
- The backend no longer returns a `banner` array, so `HostelDetail.banner` and its readers were removed in the same change. The moderator review now picks the primary photo by `is_primary`, otherwise the first image (`toReviewPhotos` in `moderation-api.ts`).

## Evidence

- `apps/web/src/app/features/public/onboarding/onboarding-wizard/onboarding-wizard.ts`: `markPrimary()`, `markedPrimaryId`, `saveAndContinue()`, `saveAndExit()`
- `apps/web/src/app/features/public/onboarding/onboarding-wizard/onboarding-wizard.spec.ts`: the `lead photo` block, including "sends no banner_id in the hostel payload"
- `apps/web/src/app/services/hostels-api.ts` (`markAttachmentAsPrimary`), `apps/web/src/app/features/host/hostel-profile/hostel-profile.ts` (the console's ordering and its reason)
- PRs #79, #81 and #83 (KratosvsEzio/hostelhive-FE)
