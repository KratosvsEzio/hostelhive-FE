# Split the landing page into section components instead of raising the style budget

**Status:** Pending — on branch `feat/mascot-loader` (PR #43), not on `main`
**Area:** [landing-page](../../area/landing-page.md)

## Context

`apps/web/project.json` caps each component stylesheet at 4 kB (warning) and 8 kB (error). The ported
landing page first compiled to 14.7 kB for `home.scss` and 8.9 kB for the hero, so the production
build failed.

## Decision

Split by section, so each stylesheet belongs to the thing it styles:

- `hero-sky/` takes the hero's backdrop (photos, tint, clouds);
- `home-why/`, `home-cities/`, `home-hosts/` take their sections;
- the hero's restyling of the shared search bar moved into the search bar's own stylesheet as an
  `hhsb-hero` variant.

Every file now sits under the 8 kB error limit (two still exceed the 4 kB warning).

## Alternatives rejected

- **Raise the budget**: a project-wide policy change made to fit one page.
- **Move the styles to `global.css`**: every page would download the landing page's CSS.

## Consequences

New landing sections should arrive as their own component with their own stylesheet. The components
are unencapsulated (they dress shared components such as the listing card and the map), so class
names keep the `hl-` / `hc-` prefix.

## Evidence

- `apps/web/project.json` (`anyComponentStyle` budget)
- `apps/web/src/app/features/public/home/` (the section components)
- `apps/web/src/app/layout/components/search-bar/search-bar.scss` (`.hhsb-hero`)
- Commit `083e611`
