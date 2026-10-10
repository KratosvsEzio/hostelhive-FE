# HostelHive — frontend

HostelHive is a two-sided hostel marketplace. Seekers search and book hostels; hosts list
and run their hostels from a console; HostelHive staff moderate listings and administer the
platform. This repository is the frontend: one Angular 21 app (server-rendered public pages,
client-rendered host and staff consoles) plus its Android app, built with Capacitor from the
same code. The backend is a separate Rails API.

## Workspace

| Project | Path | What it is |
| --- | --- | --- |
| `web` | `apps/web` | The only app: public site (SSR), seeker account, host console, staff console |
| `lib` | `lib` | The only library: `@hostelhive/ui` (design system) and `@hostelhive/maps` (Leaflet + CARTO) |
| `web-e2e` | `apps/web-e2e` | Playwright end-to-end tests |

Stack: Angular 21 (standalone, zoneless, signals), Nx 22, Tailwind CSS, Transloco (18 locales),
Leaflet, Vitest, Playwright, Capacitor 7. CI runs on Node 20.

## Setup

```bash
npm ci
cp .env.example .env
```

Build-time settings are read from the git-ignored `.env` at the repo root and written into
generated, git-ignored `*.env.ts` files by the `sync-*` Nx targets. Every key is optional;
`.env.example` explains each one:

| Variable | Used for | If unset |
| --- | --- | --- |
| `API_URL` | Backend base URL | `http://localhost:3000` |
| `GOOGLE_OAUTH_CLIENT_ID` | Google sign-in | Google sign-in unavailable |
| `GA_MEASUREMENT_ID` | Google Analytics | Analytics off |
| `CARTO_BASEMAP_KEY` | Map tiles | Tiles are watermarked |

## Commands

Run tasks through Nx (see `AGENTS.md`):

```bash
npx nx serve web          # dev server on http://localhost:4200
npm start                 # serve + regenerate the API env on change
npx nx build web          # production SSR build → dist/apps/web
npx nx test web           # unit tests (Vitest); `npx nx test lib` for the library
npx nx lint web           # ESLint
npx nx e2e web-e2e        # Playwright
```

CI (`.github/workflows/ci.yml`) runs `npx nx run-many -t lint test build typecheck e2e` on every
pull request and on pushes to `main`.

Mobile builds are in [`MOBILE.md`](MOBILE.md) (Capacitor, Android, iOS) and
[`STORE.md`](STORE.md) (signing and store submission).

## Documentation

- [Knowledge base](docs/knowledge-base/README.md): how the app is put together, area by area,
  and the decisions behind it. Read the area you are about to change first.
- [`docs/`](docs/): the build and implementation plans, the [API contract notes](docs/api/hostelhive-api.md),
  [deployment](docs/DEPLOY.md), [risks](docs/RISKS.md), and per-ticket run notes in
  [`docs/implement/`](docs/implement/).
- [`design-mockups/`](design-mockups/): the static HTML mockups used as the visual reference.
