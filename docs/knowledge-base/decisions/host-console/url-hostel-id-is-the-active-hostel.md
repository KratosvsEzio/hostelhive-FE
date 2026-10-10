# The URL's hostel id decides the active hostel, and unknown ids are refused

**Status:** Accepted
**Area:** [host-console](../../area/host-console.md)

## Context
A host with several hostels has two candidates for "the current hostel": the `:hostelId` route segment and the selection `HostPropertyStore` persists to localStorage (`hh_property`). When these disagreed, the subscription gate checked one hostel and redirected using the other. A URL naming a hostel that does not exist, such as a truncated `/host/hostels`, was also copied into the store and persisted. That poisoned every later visit with requests like `/api/hostels/hostels/edit`.

## Decision
- The route segment is the source of truth. `HostLayout` copies it into the store (`_syncStore`) and runs the subscription gate against it, not the persisted selection.
- `knownHostelGate` refuses an id that is not in the host's list and sends the host to `/host`, where `hostRootRedirect` picks a hostel.
- Guards that need billing facts read the id from the route and pass it to `isMonthlyBilled(id)` / `isNightlyBilled(id)`. They run before the shell has synced the store.

## Alternatives rejected
- **Read the store's selection everywhere.** This is how the gate and the redirect came to disagree. The shell's comment says it "let the two disagree".
- **Let the store heal itself.** The store does reset a bad saved id once the list arrives. But the shell re-reads the URL and writes the bad id straight back, so the loop only breaks by refusing entry.
- **Pick a hostel inside the gate.** Unknown ids go to `/host` instead, so the "which hostel, none, or not allowed" logic lives only in `hostRootRedirect`.

## Consequences
- An empty hostel list is treated as unknown, not as proof the hostel is fake: `loaded` is also set when the fetch fails, so those hosts are let through.
- Switching hostel keeps the current page (`onPropertySelect` + `hostPagePath`).

## Evidence
- `apps/web/src/app/features/host/host.routes.ts` — `knownHostelGate` doc comment.
- `apps/web/src/app/layout/host-shell/host-shell.ts` — constructor comment ("The route is the source of truth"), `_syncStore`, `_subscriptionGate`.
- `apps/web/src/app/services/host-property-store.ts` — `isMonthlyBilled(id)` doc comment.
- Commits 840a42b "feat(search,public): mobile map bottom sheet, static pages, and API base-URL gate" and 2b679d6 "feat(forms): one hostel form for both consoles, and stop lying to the user".
