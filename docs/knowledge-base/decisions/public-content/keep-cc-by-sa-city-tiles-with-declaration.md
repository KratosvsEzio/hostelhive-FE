# Six city tiles stay on CC BY-SA Commons photographs, with the share-alike offer made on /credits

**Status:** Accepted
**Area:** [public-content](../../area/public-content.md)

## Context

The home page shows ten city tiles, each a crop (a derivative work) of a photograph. CC BY-SA requires attribution **and** that the derivative be offered under the same licence. CC BY replacements were sought: Commons offered one like-for-like (Badshahi Mosque) because Pakistani city photography there comes mostly from Wiki Loves Monuments, which is share-alike by contest rule. Pexels had vetted images already in the repo for four cities; there was no Pexels API key to fetch more.

## Decision

- Four tiles (Karachi, Lahore, Islamabad, Rawalpindi) moved to Pexels images re-used from the blog set.
- Six tiles (Faisalabad, Peshawar, Quetta, Hyderabad at CC BY-SA 4.0; Multan, Sialkot at 3.0) stay on their Commons originals **by decision**, and each tile is itself offered under the same CC BY-SA licence.
- `/credits` makes that offer explicitly. The number in the declaration is `shareAlikeCount()` over the credit files, never typed into copy; tests hold it to the data.
- Licence names and credit lines on `/credits` stay English, like the legal pages.

## Alternatives rejected

- **Replace all ten with CC BY Commons images.** Commons has no such pool; candidates were maps, logos, museum objects (commit `5c77a6d`).
- **Attribution only.** Satisfies half of BY-SA; the derivative offer was missing (commit `d9e5c95`).
- **A hard-coded "six" in the copy.** A wrong licensing statement is worse than none; swapping an image must change the number on its own (`credits.ts`).
- **Mark the six as "awaiting replacement".** Read as unfinished work; reframed as a decision (commit `d9e5c95`).

## Consequences

- Swapping any city image means re-running `tools/fetch-city-images.mjs` and checking the declaration count on `/credits`.
- Moving a tile to Pexels or CC BY reduces the declaration automatically.

## Evidence

- `apps/web/public/cities/CREDITS.json` (top-level `licence` note), `tools/fetch-city-images.mjs`
- `apps/web/src/app/features/public/credits/credits.ts` (`shareAlikeCount`), `apps/web/src/app/features/public/credits/credits.spec.ts`
- Commits `5c77a6d` feat(cities): move four city tiles onto Pexels, and say why six cannot follow; `d9e5c95` feat(credits): make the share-alike offer, not just describe it
