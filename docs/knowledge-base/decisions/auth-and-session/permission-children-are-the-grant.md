# Permission children are the grant, and an empty set is not gated

**Status:** Accepted
**Area:** [auth-and-session](../../area/auth-and-session.md)

## Context
`GET /api/users/current` returns permissions as `{ group: { Subject: { parent, children[] } } }`. `permissionGuard` and `*hhHasPermission` existed before the payload did and had nothing to check. When the payload arrived, two readings were possible, and older cached sessions (and deployments without the field) carry no permissions at all.

## Decision
- Flatten only `children` into `group:Subject:action` flags (`host:Room:create`). `parent` is the group's label, not a grant: `host.Hostel` carries a `manage` parent while its children are only `index` and `show`.
- A granted `manage` child still covers every action on its subject.
- A session with **no** flags is not gated; `hasPermission` returns true. Once any flag is present, absent ones are denied. Super Admin passes everything.

## Alternatives rejected
- **Treat `parent` as a grant**: would hand out create/update the API never listed.
- **Deny when the list is empty**: every route and button would vanish for cached sessions and for any deploy without the field. The server enforces regardless; this check is UX.

## Consequences
- Anything that produces a session with an empty permission list, including the `?role=` dev seed in `app.config.ts`, sees every permission-gated control.
- Hostel creation is gated on `core:Hostel:create` rather than a role.
- End-to-end hiding was verified only with an all-permissions session (commit body).

## Evidence
- `apps/web/src/app/core/auth/permissions.ts`, `apps/web/src/app/core/auth/session-store.ts` (`hasPermission`)
- `apps/web/src/app/features/host/host.routes.ts`, `apps/web/src/app/features/admin/admin.routes.ts`
- a3273dd feat(auth): drive authorization from the API's permission payload (PR #26)
