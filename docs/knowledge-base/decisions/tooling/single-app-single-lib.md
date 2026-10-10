# One app and one library, with Nx module boundaries switched off

**Status:** Accepted
**Area:** [tooling](../../area/tooling.md)

## Context
The plan and the first scaffold had two apps (`web` for the public SSR site, `console` for host and staff) and about 16 libraries tagged `scope:*` × `type:*`, with `@nx/enforce-module-boundaries` enforced (`docs/HostelHive-Frontend-Build-Plan.md`). On 2026-06-13 the user directed a consolidation.

## Decision
- The workspace has three projects: `web`, `lib` and `web-e2e`.
- The console is part of `web`. Public routes are server-rendered; console routes are lazy, client-rendered and role-guarded.
- Shared code lives in one Nx project, `lib`, behind granular aliases (`@hostelhive/ui`, `@hostelhive/maps`) so lazy chunks stay separate.
- Feature code moved into the app under `apps/web/src/app/features/`. The models behind `@hostelhive/data-access` now live in `apps/web/src/app/util/models` (`lib/src/data-access/index.ts`).
- `@nx/enforce-module-boundaries` is `'off'`. The old tag constraints are kept in `eslint.config.mjs` as documentation.

## Alternatives rejected
- **Two apps.** The plan wanted a physically separate console so that `/admin` could be IP-allowlisted at the edge (PRD §9.2). That isolation was traded for simpler operations; protection is now guards, separate lazy bundles and server-side authorization (`docs/HostelHive-Implementation-Plan.md`).
- **Many libraries with enforced boundaries.** With a single library every import is a self-import, so the scope and type tags no longer mean anything.

## Consequences
- Nothing structural stops a UI component from importing app code. Review has to catch it. The library keeps its independence by convention and injection tokens (`HH_LINK_LOCALISER`, `LEAFLET_MAPS_CONFIG`), not by lint.
- The CI comment "Lint enforces module boundaries" (`.github/workflows/ci.yml`) is out of date.
- The app's ESLint accepts both `app` and `hh` selector prefixes, because features moved in from the library kept their `hh-` names (`apps/web/eslint.config.mjs`).
- `docs/HostelHive-Frontend-Build-Plan.md` still describes the two-app topology, with *Superseded* notes pointing here.

## Evidence
- `eslint.config.mjs` ("Single-app + single-lib architecture: module boundaries no longer apply")
- `lib/src/index.ts`, `lib/src/data-access/index.ts`, `tsconfig.base.json`
- `docs/HostelHive-Implementation-Plan.md` (execution log, "Architecture consolidation → 1 app + 1 lib")
