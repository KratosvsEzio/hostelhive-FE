# Online booking is offered only by hostels that bill nightly

**Status:** Accepted
**Area:** [listing-and-booking](../../area/listing-and-booking.md)

## Context

The room picker and basket were built for short stays. Most HostelHive hostels are student hostels let by the month; backpacker hostels are let by the night. A checkout button on a monthly tenancy, with a percentage deposit, would ask a student for a large sum before they had seen the room.

## Decision

- `canBookOnline(period)` is true only for `nightly`. Monthly hostels render the same room cards (`hh-room-picker` drops its controls) but no booking rail, and keep the call / WhatsApp enquiry path.
- The period comes from what the hostel **charges**: `periodFromBillingFrequency(billing_frequency)` (`night` / `month`), falling back to `periodForAccommodation` (backpacker → nightly) only when the payload does not say.

## Alternatives rejected

- **Online booking for every hostel.** A monthly let is "an agreement, a look at the place, a conversation about mess timings"; 10% of a twelve-month let is about PKR 30,000 asked up front (`room-offer.ts` `canBookOnline` doc, commit `98d10cb`).
- **Gate on accommodation type alone** (the first implementation). A backpacker hostel billing monthly was offered checkout and a boys hostel billing nightly was refused it (commit `24a4cb5`).
- **Default a missing `billing_frequency` to monthly.** That would silently close booking on every hostel whose serializer predates the field; `periodFromBillingFrequency` returns `null` instead (commit `24a4cb5`).
- **Hide rooms for monthly hostels.** Earlier behaviour; the picker now lists rooms for both and drops only the controls (commit `44e6774`).

## Consequences

- The "/ night" vs "/ month" label on the page follows the same signal (`fromPeriodLabel`), so labels and the booking path cannot disagree.
- Search uses the accommodation-type rule (no `billing_frequency` on the search document), so a card and its page can label a hostel's cycle differently.

## Evidence

- `apps/web/src/app/features/public/listing/booking/room-offer.ts` (`canBookOnline`)
- `apps/web/src/app/features/public/listing/listing-detail/listing-detail.ts` (`bookingPeriod`, `bookingEnabled`)
- `apps/web/src/app/util/pricing-period.ts`
- Commits `98d10cb` feat(booking): room picker, basket…; `24a4cb5` fix(booking): gate online booking on what a hostel charges, not its type; `44e6774` feat(listing): give every hostel the same room section, whatever it charges
