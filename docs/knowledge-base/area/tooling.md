# Tooling, build and CI

How the workspace is put together and run: the Nx projects and their targets, the test and lint setup, the `tools/` scripts, CI, and the local dev server. Deployment of the SSR server is in `docs/DEPLOY.md`. The Capacitor build is in [mobile-app](./mobile-app.md) and `MOBILE.md`.

## Where it lives
- `nx.json` — inferred-target plugins (`@nx/vite` → `build`/`serve`/`test`/`typecheck`, `@nx/vitest` → `vite:test`, `@nx/eslint` → `lint`, `@nx/playwright` → `e2e`, `@nx/storybook`), caching defaults, and generator defaults (CSS, Vitest via Analog, Playwright).
- Three projects:
  - `apps/web/project.json` — `web`, the only app: SSR, prefix `app`.
  - `lib/project.json` — `lib`, the only library: `@hostelhive/ui`, `@hostelhive/maps`, testing helpers.
  - `apps/web-e2e/project.json` — Playwright.
- `tsconfig.base.json` — path aliases: `@hostelhive/ui|maps|lib`, `@hostelhive/data-access` (points into `apps/web/src/app/util/models`), `@app/*`, `@core/*`, `@features/*`, `@layout/*`, `@services`, `@util/*`.
- `apps/web/vite.config.mts`, `lib/vite.config.mts`, `vitest.workspace.ts` — Vitest (jsdom, globals) through `@analogjs/vite-plugin-angular`. Setup files are `apps/web/src/test-setup.ts` (TestBed plus a `ResizeObserver` stub) and `lib/src/test-setup.ts`.
- `eslint.config.mjs` (root), `apps/web/eslint.config.mjs` (selector prefixes `app` or `hh`), `lib/eslint.config.mjs` (prefix `hh`).
- `.github/workflows/ci.yml` — the only workflow.
- `tools/` — scripts, listed below.
- `design-mockups/` — static HTML mockups (`design-mockups/index.html` gallery, `design-mockups/30-design-system.html`), the visual acceptance reference.
- `AGENTS.md`, `CLAUDE.md` — currently only the generated Nx agent guidelines (use `nx` to run tasks; use the generator skill for scaffolding). No project-specific house rules live there.

## How it works
- **Run:**
  - `npx nx serve web` (development config; the default port is 4200).
  - `npm start` runs `nx run web:dev`, which is `serve` plus `tools/generate-api-env.mjs` in watch mode.
  - `npx nx build web` → dist/apps/web/ (browser + server/server.mjs).
  - `npx nx test web` / `npx nx test lib`, `npx nx lint web`, `npx nx e2e web-e2e`.
- **Build prerequisites.** `build` and `build-mobile` depend on `sync-api-env`, `sync-oauth-env`, `sync-google-analytics-env`, `sync-maps-env` and `i18n-check`; `serve` depends on the four sync targets only. Each sync script reads the repo-root `.env` and writes a git-ignored `*.env.ts` beside `apps/web/src/app/app.config.ts` (see `.gitignore`).
- **Budgets** (`apps/web/project.json`): initial bundle 1.5 MB warn / 3.5 MB error; any component style 4 kB / 8 kB. They apply in the `production` configuration and in `build-mobile`.
- **CI** (`.github/workflows/ci.yml`): Node 20, `npm ci`, Playwright shell, then `npx nx run-many -t lint test build typecheck e2e` on pushes to `main` and on every PR.
- **Local preview.** The git-ignored .claude/launch.json in the main checkout defines `web` (`npx nx serve web --port 4300`) and `mockups` (`npx serve design-mockups -p 4400`).

**`tools/` scripts:**
- `tools/generate-api-env.mjs` — `API_URL` → api.env.ts (`--watch` supported).
- `tools/generate-google-oauth-env.mjs` — `GOOGLE_OAUTH_CLIENT_ID` → google-oauth.env.ts.
- `tools/generate-google-analytics-env.mjs` — `GA_MEASUREMENT_ID` → google-analytics.env.ts (empty is a valid state). A `GA_MEASUREMENT_ID` in the process environment wins over `.env`; the e2e webServer sets the fake `G-E2ETEST000` that way, so analytics specs can read `window.dataLayer`.
- `tools/generate-maps-env.mjs` — `CARTO_BASEMAP_KEY` → maps.env.ts (empty draws watermarked tiles).
- `tools/i18n-check.mjs` — build gate: keys used but missing from en.json. `tools/i18n-coverage.mjs` — per-locale completeness report, not gated. See [i18n](./i18n.md).
- `tools/build-icon-font.mjs` (`npm run icons:font`) and `tools/icon-check.mjs` (`npm run icons:check`) — Tabler subset and its guard. See [ui-library](./ui-library.md).
- `tools/generate-icons.mjs` (`npm run icons:generate`) — favicons, PWA icons and Capacitor sources from the brand mark.
- `tools/gen-brand-logos.js` — inlines the logo SVGs into `apps/web/src/app/core/brand/brand-logos.ts`.
- `tools/build-pak-geo.mjs`, `tools/build-country-bounds.mjs` — geodata. See [maps](./maps.md).
- `tools/fetch-city-images.mjs`, `tools/fetch-hero-images.mjs` — landing tiles and their CREDITS.json licences. See [landing-page](./landing-page.md).
- `tools/api-probe.mjs` — dev-only: signs in to a local backend and prints response shapes.
- `tools/build-android.ps1`, `tools/setup-ios.sh` — native builds. See `MOBILE.md`.

## Reuse, don't rebuild
- A new build-time secret or ID: copy the `generate-*-env.mjs` pattern, add a `sync-*` target to `dependsOn`, and git-ignore the output.
- A new invisible-failure guard: follow the `tools/i18n-check.mjs` / `tools/icon-check.mjs` shape (cheap, deterministic, non-zero exit).
- Run tasks through `npx nx …`, as `AGENTS.md` asks.

## Traps
- **Version is Angular 21.2, not 22** (`package.json`), on Nx 22.7.5. Plans and the initial commit say "Angular 22".
- **Module boundaries are off.** `@nx/enforce-module-boundaries` is `'off'` in `eslint.config.mjs`, but the CI comment says "Lint enforces module boundaries".
- **Template a11y lint rules are downgraded to `warn`** ("for M1") in `eslint.config.mjs`.
- **Unguarded checks.** `icons:check` and `i18n-coverage` are not in CI; `i18n-check` runs only through `build`.
- **Some specs read source, locale or asset files from disk, so "the changed files' specs" never selects them.** These include the `.message` guard (`apps/web/src/app/core/errors/no-raw-error-message.spec.ts`), the locale-parity specs, and the blog, SEO, social-image and no-photos checks: 29 files on 2026-10-19. They key on paths, not imports.
  - `main` went red on the `.message` guard after PRs #128, #149 and #181. Each was merged before its CI finished: #128 and #149 within two minutes of their runs starting (both runs then failed), and #181 while CI was stalled. #149 and #181 had run only focused specs; #128's branch predated the guard.
  - Add these specs to every focused run, and again after merging `main`. Select them with `git grep -lE "readdirSync|readFileSync|existsSync|locale-files-testing" -- "apps/web/src/**/*.spec.ts"` (Trello #205).
- **e2e** (`apps/web-e2e/src/*.spec.ts`) runs against `nx run web:serve` on `E2E_PORT` (default 4200). The dev server is built with a fake GA id, so every spec starts with analytics consent `denied` (`use.storageState` in `playwright.config.ts`), which keeps the consent banner off the page. A spec that checks GA events calls `captureAnalytics` and `gaEvents` (`support/analytics.ts`): they grant consent, abort Google's hosts, and read `window.dataLayer`.
- **`tools/gen-brand-logos.js` hard-codes absolute paths** under D:/GitHub/HostelHive, so it breaks in any other checkout or worktree.
- **`serve.log` is committed** at the repo root.
- **`docs/HostelHive-Frontend-Build-Plan.md` describes two apps** (`web` + `console`); the workspace is one app. The plan marks it *Superseded* inline, but the milestone rows (M0 "2 app shells") still read as written.
- **`afterNextRender` can silently never fire** for elements created by a conditional render, and the suite will not catch it (`lib/src/ui/lib/dialog-focus/dialog-focus.ts`).
- **Without `ResizeObserver`, jsdom fails the run** even though every test passes. Keep the stub in `apps/web/src/test-setup.ts`.

## Decisions
- [Stay on Angular 21 until Nx supports 22](../decisions/tooling/angular-21-until-nx-supports-22.md)
- [One app and one library, with module boundaries off](../decisions/tooling/single-app-single-lib.md)

## See also
- `docs/DEPLOY.md` (SSR server, `NG_ALLOWED_HOSTS`), `MOBILE.md`, `STORE.md`, `docs/HostelHive-Implementation-Plan.md` (execution log), `docs/api/hostelhive-api.md`
- [app-shell-and-routing](./app-shell-and-routing.md), [ssr-seo-and-prerender](./ssr-seo-and-prerender.md), [mobile-app](./mobile-app.md), [ui-library](./ui-library.md), [i18n](./i18n.md), [maps](./maps.md)
