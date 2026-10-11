# Meal confirmations happen only in notifications; there is no tokened confirm page

**Status:** Accepted
**Area:** [seeker-account](../../area/seeker-account.md)

## Context

Trello #104 reported that `/mess/confirm?token=…` showed "Confirmed" while nothing was saved. The page came from the early mock design. It read a token from the URL, looked the meal up through `GET /public/meal_confirmations/meal_info/:token`, and wrote the confirmation to a seeded in-memory list in `MessNotificationsService`.

None of that was backed by the server. The `meal_info` route does not exist on any branch of the backend (azeem-hamza/hostelhive), so every token showed "invalid". There is no public route that confirms by token. The meal email (`app/views/user_invite_mailer/meal_confirmation_invitation.html.erb`) has no link and tells the student to log in to the app. `pre_requisite_invite_action_service.rb` builds a `/meal_confirmation?token=…` URL, but the template never uses it.

Meanwhile the in-app flow already worked end to end. Creating a `MealConfirmation` creates a notification (a `UserInvite` of type `meal_confirmation`). Accepting it runs `PostRequisiteInviteActionJob`, which sets `is_confirmed`, and the host's confirmations list reads that.

## Decision

- Meal confirmations are accepted **only from notifications** (`/notifications` and the bell, via `StudentApi.acceptInvite`). The backend developer confirmed this is the intended design.
- `/mess/confirm` is removed, along with `getMealInfo` and the mock token and confirmation code in `MessNotificationsService`, which now holds settings only.
- `/mess/confirm` and `/meal_confirmation` redirect to `/notifications` through `toNotifications`. The redirect keeps the language prefix and drops the query string, so a stale token never reaches the login page's `returnUrl`.

## Alternatives rejected

- **Public token-keyed routes** (`meal_info` plus `POST /public/meal_confirmations/confirm`), making the page a one-tap confirm with no login. This was built in the FE as PR #54 against a drafted backend ticket (Trello #108). Both were withdrawn once the backend developer said confirmation is by notification only.
- **Keeping the page with a "log in and confirm" fallback.** The token in the link cannot be matched to a notification, whose payload names the meal only by `associated_id`. The page would have duplicated the notifications list.

## Consequences

- A request for "confirm from the email/WhatsApp link" is a **new backend feature**, not a front-end bug. It needs the public routes described in archived Trello #108 and a link in the email template.
- The host's mess notification settings still offer WhatsApp and SMS channels. Whether the backend sends those has not been checked.

## Evidence

- PR #71 (KratosvsEzio/hostelhive-FE), merged 2026-10-11 as `2bb7752`; closed PR #54; Trello #104, archived #108
- `apps/web/src/app/app.routes.ts` (`toNotifications`), `apps/web/src/app/app.routes.spec.ts`, `apps/web/src/app/services/student-api.ts` (`acceptInvite`)
- Backend: `config/routes.rb` (no public meal routes), `app/controllers/api/user_invites_controller.rb` (`mark_as_accepted`), `app/services/post_requisite_invite_action_service.rb`
- Run record: `docs/implement/Bugs/104.md`
