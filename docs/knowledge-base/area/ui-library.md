# UI library and design system

The shared visual layer: the `@hostelhive/ui` component library, the Tailwind brand preset, the global stylesheet, the brand logo, the self-hosted fonts and the subsetted Tabler icon font. Feature screens live in the app; anything a second screen would copy belongs here. Maps components are in [maps](./maps.md); translation plumbing in [i18n](./i18n.md).

## Where it lives
- `lib/src/ui/index.ts` — the `@hostelhive/ui` barrel (alias in `tsconfig.base.json`). Spec it points to: `design-mockups/30-design-system.html`.
- `lib/src/ui/lib/` — one folder per component. Selector prefix `hh` is lint-enforced (`lib/eslint.config.mjs`).
- `lib/tailwind-preset.js` — brand tokens; consumed by `apps/web/tailwind.config.js`, whose content globs cover `lib/src`.
- `apps/web/src/styles.css` — Angular Material azure-blue prebuilt theme (needed by the phone input's `mat-select`) plus the three Tailwind layers.
- `apps/web/src/global.css` — fonts, icon font import, and every global class (listed below). Both stylesheets are entries in the `styles` array of `apps/web/project.json`.
- `apps/web/src/icons/` — generated icon subset (CSS + two woff2 files). Do not edit by hand.
- `apps/web/src/app/core/brand/logo.ts` — `i[hhLogo]` directive; SVG source strings in `apps/web/src/app/core/brand/brand-logos.ts`.
- `apps/web/src/app/shared/` — app-level reusables: `apps/web/src/app/shared/lazy-src/lazy-src.ts` (`[hhLazySrc]`), `apps/web/src/app/shared/overflow-probe/overflow-probe.ts` (`[hhOverflows]`), `apps/web/src/app/shared/photo-picker/photo-picker.ts` (`hh-photo-picker`), plus `apps/web/src/app/shared/currency`, `apps/web/src/app/shared/money-input`, `apps/web/src/app/shared/timezone` (see [dates, money and time zones](./dates-money-and-time-zones.md)).
- `lib/.storybook/` — Storybook config; stories sit beside components as `*.stories.ts` (17 of them). The `@nx/storybook` plugin in `nx.json` infers the target. Stories are excluded from `lib/tsconfig.lib.json`.

## How it works
**Inventory** (`lib/src/ui/lib/`): `button[hh-button]`/`a[hh-button]` (variant × color × size; `lib/src/ui/lib/button/button.ts`), `button[hh-chip]` filter pill, `hh-badge`, `hh-status-pill`, `hh-card`, `hh-collapsible-card`, `hh-avatar`, `[hhTip]`/`[hhTooltip]` tooltips, `hh-skeleton` (shimmer), `hh-toast`, `hh-empty-state`/`hh-error-state`/`hh-gate`/`hh-no-results` (`lib/src/ui/lib/states`), `hh-input` (label, icon, password reveal), `hh-phone-input` (wraps ngx-material-intl-tel-input, emits E.164), `hh-toggle` (its switch button has no text, so every use needs a name: a wrapping `<label>`, `label` (set as `aria-label`) or `labelledBy`. `core/toggle-names.spec.ts` fails on a use with none (Trello #218). `describedBy` sets `aria-describedby` on the button, which the host element can't carry for it), `hh-stepper`, `hh-tabs`, `hh-pagination`, `hh-range-slider` (dual thumb), `hh-dropdown` (portalled, viewport-fitting panel), `hh-search` (`lib/src/ui/lib/scoped-search/scoped-search.ts`), `hh-date-picker`, `hh-date-range-picker`, `hh-time-picker`, `hh-rich-text`, `hh-confirm-modal`, `hh-drawer` (right slide-over), `hh-context-menu`, `hh-filter-chips`, `hh-global-filter`, `hh-data-table`, `hh-photo-grid` (upload grid + MIME helpers), `hh-photo-placeholder`, `hh-breadcrumb`, `hh-divider`, `[hhLink]`, `hh-donut`, `hh-bar-chart` (inline SVG, no chart lib), `[hhContainer]` (page band: `mx-auto max-w-7xl px-5 sm:px-8`), `[hhDialogFocus]` (focus trap + return), the `CompactNumber` pipe, and the `HH_LINK_LOCALISER` token (`lib/src/ui/lib/link-localiser.ts`).

**Rich text.** `hh-rich-text` (`lib/src/ui/lib/rich-text/rich-text.ts`) wraps **ngx-editor** (ProseMirror) with an emoji picker. Value in and out is an HTML string. It renders only in the browser (`ngSkipHydration`, placeholder on the server). Stored HTML is displayed with Angular-sanitized `[innerHTML]` inside a `.hh-rich` container, as in `apps/web/src/app/features/public/listing/listing-detail/listing-detail.html`. Editor and `.hh-rich` styles are in `apps/web/src/global.css`.

**Tokens** (`lib/tailwind-preset.js`): `brand` 50–900 (500 = #F36E21), `ink` 50–900, `surface`, `tint.{mint,blue,green,sky,purple,cream}`, `ok`, `warn` (+`warn-700` for readable text), `danger`, `boys`/`girls`/`backpacker`, radii `xl` 12 / `2xl` 16 / `3xl` 22, shadows `card`/`cardhover`/`pill`, `font-sans` Inter and `font-display` Poppins. Fonts are self-hosted via `@fontsource` imports at the top of `apps/web/src/global.css`, so the Capacitor app renders offline.

**Global classes** (`apps/web/src/global.css`): `.shimmer`, `.no-scrollbar`, `.hh-scroll-thin`, safe-area helpers `.safe-pt`/`.safe-pb`/`.safe-mb`, tab-bar clearance (`--hh-tabbar-h`, `.hh-above-tabbar`, `.hh-pb-tabbar`), header offsets (`--hh-header-h`, `.hh-below-header`, `.hh-viewport-below-header`, `.hh-brand-row`), `.hh-input`, `.tip`, `.nav-link`, `.featured-card`/`.featured-pill`, `.hh-tag-skew`, landing motifs `.hex`, `.hh-float`, `.hh-rise`/`-2`/`-3`, `.comb-strip`, map marker classes (see [maps](./maps.md)), RTL rules, blog cover fields, and a reduced-motion net.

**Icons.** `<i class="ti ti-name">` from a Tabler subset built by `tools/build-icon-font.mjs` (`npm run icons:font`); `tools/icon-check.mjs` (`npm run icons:check`) fails when the source uses a class the subset lacks.

## Reuse, don't rebuild
- Buttons: `hh-button` attributes, never a hand-styled `<button>`; focus ring is `ink-900` + offset (`lib/src/ui/lib/button/button.ts`).
- Page width: `hhContainer`, not `mx-auto max-w-7xl …` again.
- Slide-over forms: `hh-drawer`; modals: `hh-confirm-modal` + `hhDialogFocus`.
- Loading: `hh-skeleton`; empty/error: the `lib/src/ui/lib/states` components.
- Images below the fold: `[hhLazySrc]` (`apps/web/src/app/shared/lazy-src/lazy-src.ts`), not `loading="lazy"` alone.
- "Show more" only when clipped: `[hhOverflows]`.
- Photo input: `hh-photo-picker` (drag-drop, files, camera).
- Logo: `<i hhLogo>`; brand colours: preset tokens, not hex.

## Traps
- **Icon renders blank** if you add a `ti-*` class without re-running `npm run icons:font`. The scanner matches literal `ti-…` tokens in `.ts`/`.html` under `apps/web/src` and `lib/src`, so a class built by string concatenation is never seen. `icons:check` is not in `.github/workflows/ci.yml`. The generator calls the Windows `py` launcher for fontTools (`tools/build-icon-font.mjs`), so it will not run unchanged on Linux/macOS.
- **The preset comment on `brand-600` is stale.** It says `text-brand-600` paints ~154 links and is the primary button fill. Since 2bfdae8 the app uses `brand-500` (zero `text-brand-600` uses left) and `brand-600` is only the hover step (`lib/src/ui/lib/button/button.ts`).
- **Preset and mockup theme have drifted.** The preset claims it mirrors `design-mockups/assets/hh-theme.js` verbatim, but `brand-600`, `warn-700` and `backpacker` differ.
- `afterNextRender` registered while an `@if` creates the element may never fire in this zoneless app. Unit tests still pass. Use `ngAfterViewInit` (explained in `lib/src/ui/lib/dialog-focus/dialog-focus.ts`).
- Library components cannot use the app's `a[routerLink]` locale directive; build links through `HH_LINK_LOCALISER` (`lib/src/ui/lib/link-localiser.ts`).
- Component styles budget: 4 kB warn / 8 kB error (`apps/web/project.json`). Large shared CSS goes in `apps/web/src/global.css`.
- `apps/web/src/global.css` says it is "imported by each app's styles.css". It is not; both are listed side by side in `apps/web/project.json`.

## Decisions
- [Primary brand colour is brand-500, accepting sub-AA white text](../decisions/ui-library/brand-500-over-contrast-retune.md)
- [Ship a subsetted Tabler icon font, generated and checked](../decisions/ui-library/subset-tabler-icon-font.md)

## See also
- [maps](./maps.md), [i18n](./i18n.md), [tooling](./tooling.md), [landing-page](./landing-page.md), [dates-money-and-time-zones](./dates-money-and-time-zones.md)
- `design-mockups/30-design-system.html`, `design-mockups/index.html`
