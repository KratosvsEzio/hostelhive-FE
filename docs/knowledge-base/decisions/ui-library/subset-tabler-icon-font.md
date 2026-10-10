# Ship a subsetted Tabler icon font, generated from source and checked

**Status:** Accepted
**Area:** [ui-library](../../area/ui-library.md)

## Context
Icons are Tabler webfont classes (`ti ti-*`). The full package ships 5,147 outline glyphs (447 KB woff2), 1,056 filled glyphs (71 KB), and a stylesheet with one rule per icon. HostelHive uses about 235 outline and 9 filled glyphs. For an audience on mid-range Android over patchy connections, the font was the largest asset on the page. It also shipped with `font-display: block`, so every icon, including the phone glyph in the primary CTA, stayed invisible until the font loaded.

## Decision
Generate `apps/web/src/icons/` (subset woff2 files + `apps/web/src/icons/tabler-icons.generated.css`) from the `ti-*` classes the source actually references, using `tools/build-icon-font.mjs` (`npm run icons:font`). The generator adds `font-display: swap` and derives the `-filled` class names, which are HostelHive's own mapping onto Tabler's filled font. `tools/icon-check.mjs` (`npm run icons:check`) fails if the source references a class the subset lacks. `apps/web/src/global.css` imports the generated CSS.

## Alternatives rejected
- **Import `@tabler/icons-webfont` whole.** This was the earlier state. About 95% of the bytes were never used, and its blocking font-display hid icons on slow loads (`apps/web/src/global.css` comment).
- **Tabler from a CDN.** The packaged Capacitor app must render offline, so fonts and icons are self-hosted (`apps/web/src/global.css` header).
- **A hand-maintained filled-class map.** Four `-filled` classes shipped rendering nothing for months because the map was edited by hand (`tools/icon-check.mjs`).

## Consequences
- Adding or removing an icon requires `npm run icons:font`. Otherwise the icon renders blank, with no error. Only literal `ti-…` tokens in `.ts`/`.html` files are detected, so a class built by string concatenation is missed.
- The generator needs Python fontTools through the Windows `py` launcher, plus `ttf2woff2` from node_modules.
- Both headers call `icons:check` "worth running in CI", but `.github/workflows/ci.yml` does not run it.

## Evidence
- `tools/build-icon-font.mjs`, `tools/icon-check.mjs`, `apps/web/src/global.css` (icon-font comment), `package.json` scripts
- 3f8f5c4 fix(a11y): give every control a keyboard, a name, and a visible focus (brought in the tooling and `font-display: swap`)
- 1e64fb8 fix(icons): add ti-photo-search to the icon font subset (PR #39). This is the failure mode in practice.
