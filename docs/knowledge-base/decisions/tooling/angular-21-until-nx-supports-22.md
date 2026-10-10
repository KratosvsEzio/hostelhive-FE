# Build on Angular 21 + Nx 22 until Nx supports Angular 22

**Status:** Accepted
**Area:** [tooling](../../area/tooling.md)

## Context
The build plan targeted Angular 22, the current stable release when work began (`docs/HostelHive-Frontend-Build-Plan.md`). When the workspace was scaffolded on 2026-06-12, no Nx release supported it: `@nx/angular` capped its Angular peer range below 22 on stable (22.7.5), on the 23 RC and on the canary.

## Decision
Run on Angular 21.2 (`@angular/core` 21.2.9) with Nx 22.7.5, both stable (`package.json`). Migrate with `nx migrate` once Nx ships Angular 22 support, and before any work that needs a 22-only feature. This was the user's call, recorded in `docs/HostelHive-Implementation-Plan.md` ("Version decision — Angular 21 now, Angular 22 by migration").

## Alternatives rejected
- **Drop Nx to get Angular 22.** Nx is the monorepo backbone: inferred targets, caching, generators and CI `run-many`.
- **Force Angular 22 under an Nx that declares it incompatible.** An unsupported peer combination for every build and migration.

## Consequences
- Anything that says "Angular 22" describes the intent, not the code: the initial commit message 24ceaad, the build plan, and the brief for this knowledge base. Check `package.json` before relying on a 22-only API.
- Zoneless change detection and signals are used as planned. zone.js is still listed in dependencies.
- The migration is an open follow-up, owned by whoever next touches the toolchain.

## Evidence
- `package.json` (`@angular/core` 21.2.9, `nx` 22.7.5)
- `docs/HostelHive-Implementation-Plan.md` (§11 execution log, version decision)
- 24ceaad Initial commit — HostelHive FE (message says "Angular 22")
