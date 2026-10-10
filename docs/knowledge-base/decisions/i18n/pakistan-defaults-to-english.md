# A visitor in Pakistan opens in English, not Urdu

**Status:** Accepted
**Area:** [i18n](../../area/i18n.md)

## Context
`GeoPreference` guesses a starting language and currency from the visitor's IP country, but only for the halves the visitor has not chosen and, for language, only when the URL did not name one. The guess comes from the `COUNTRIES_BY_LOCALE` table in `apps/web/src/app/core/geo/country-preferences.ts`. Pakistan, the core market, used to map to `ur`.

## Decision
`ur` maps to **no country** (`ur: []`), so a visitor in Pakistan falls through to English. Urdu is still fully offered: it is in the switcher, lays out RTL, every `/ur/…` link opens in it, and a recorded choice is never overridden.

## Alternatives rejected
- **Pakistan → Urdu.** Urdu is the language most Pakistanis speak, which made the entry look right. But English is an official language and the one Pakistani booking, banking and travel sites are written in, so it is what a visitor there expects. The table answers "what does a stranger see before telling us anything", and "reads Urdu" is a far narrower claim about a person than "is in Pakistan" supports (comment on `ur` in `apps/web/src/app/core/geo/country-preferences.ts`).
- **One country listed under several languages.** The table maps each language to its countries and is inverted at load, which makes listing a country twice impossible to write. Each country is listed under the language most of its people read: Belgium under Dutch, Switzerland under German.

## Consequences
- Do not "fix" the empty `ur` entry. The spec next to the table (`apps/web/src/app/core/geo/country-preferences.spec.ts`) covers this mapping.
- The wrong guess costs one click on the switcher, which is always in the header.
- Unlisted countries fall back to English and USD (`FALLBACK_CURRENCY`).

## Evidence
- `apps/web/src/app/core/geo/country-preferences.ts` (comment on `ur`)
- eb397b3 feat(host): bookings, a bed-pip room calendar, and a collapsible console (the change landed bundled in this commit)
- 3913972 feat(i18n): let the visitor's country pick the language and currency
- 32c2490 feat(i18n): let a chosen language or currency outrank the location guess
