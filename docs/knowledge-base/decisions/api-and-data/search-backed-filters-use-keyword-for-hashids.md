# Exact-match filters on a dynamically mapped hashid go to its `.keyword` field

**Status:** Accepted
**Area:** [api-and-data](../../area/api-and-data.md)

## Context
Host list endpoints answer from the backend's search index, and an `f[<field>]` param becomes an exact-term filter on it. The renter-bills index has no explicit mapping for `billable_id` (backend `renter_bill_index.rb`), so the dynamic template in its `settings.rb` stores it as analysed, lowercased text. Hashids are mixed case, so a term filter on the plain field never matches: after every reload a booking's invoice looked absent and Generate invoice was offered again.

The live probe on a nightly hostel's renter bills, with one booking bill known to exist (run notes, 5e round 1, defect D-2):

| Filter | Bills |
|---|---|
| `f[billable_id][]=ewPcpb` | 0 |
| `f[billable_id]=ewPcpb` | 0 |
| `f[booking.id]=ewPcpb` | 0 |
| `f[billable_id][]=ewpcpb` (lowercased) | 1 |
| `f[billable_id.keyword][]=ewPcpb` | 1 |

## Decision
- An exact-match filter on a hashid the backend maps dynamically is sent to `f[<field>.keyword]`. `HostOpsApi.bookingInvoices` sends `f[billable_id.keyword][]`, with a doc comment saying why.
- A field the backend maps as a keyword explicitly is filtered by its plain name: `f[occupied_room_ids]` (room detail, room calendar, the bookings room filter). Lowercase slugs (`f[status.slug]`, `f[bill_type]`) and date ranges are unaffected.
- A new filter on a hashid is checked live before it is trusted. A filter that silently matches nothing reads exactly like "no data".

## Alternatives rejected
- **Lowercase the id.** It matches today, but only through the analyser: it would stop matching the day the field is mapped as a keyword, and it reads like a bug to fix.
- **Filter on `booking.id`.** The embedded booking block is dynamically mapped too; the probe found nothing.
- **Wait for a backend mapping.** Filed as a backend follow-up (run notes, Summary); the invoice lookup could not wait on it.

## Consequences
- If the backend maps `billable_id` explicitly as a keyword without a `.keyword` subfield, this lookup returns nothing again. Change the filter in the same release as the mapping.
- The rule is invisible in the calling code except for that one comment; the next filter on a hashid would fall into the same hole without it.

## Evidence
- `apps/web/src/app/services/host-ops-api.ts` — `bookingInvoices` and its doc comment.
- `apps/web/src/app/services/host-ops-api.spec.ts` — "filters the ids on the exact keyword field, never the analysed one".
- `docs/implement/TRELLO-83.md` — 5e round 1 (M-01, D-2: the probe), the fix report, and 5e round 2 (M-01 passing on `.keyword`).
- Trello #83; PR #128 (KratosvsEzio/hostelhive-FE), run notes `docs/implement/TRELLO-83.md`
