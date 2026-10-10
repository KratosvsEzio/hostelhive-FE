# Landing page

The public home page at `/` (and `/:locale/`). It is a seeker's first screen and the site's brand
moment, so it carries more motion than any other page, all of it built on the app's real components
rather than copies of them.

## Where it lives

- `apps/web/src/app/features/public/home/home.ts`, `home.html`, `home.scss`: the page. Owns the SEO
  and JSON-LD, the featured listings fetch, the city and province lists, and the sections that are
  not their own component (Hand-picked, Find by location, How it works, Loved by movers, the closing
  search band).
- `features/public/home/hero-clouds/`: the hero. Three full-screen scenes that change through rolling
  clouds, a rail of round thumbnails on an orbit ring, the search bar with the bee perched on it.
- `features/public/home/hero-sky/`: the hero's backdrop (photos, tint, cloud layers). Presentational;
  HeroClouds animates its elements directly.
- `features/public/home/home-cities/`, `home-why/`, `home-hosts/`: the city globes, the Why HostelHive
  cards with product mock-ups, the dusk host band.
- `features/public/home/home-country.ts`, `country-locations.ts`: the page follows the visitor's
  country (`GeoPreference`, falling back to `PK`). Regions, cities and the four popular-city chips are
  tallied from one `/public/hostels` page of up to 500 hostels (`COUNTRY_HOSTEL_LIMIT`), a stopgap
  until the backend has a locations endpoint. City globes show only for Pakistan.
- `features/public/home/country-map/`: "Explore {country}" on Leaflet (see [maps](./maps.md)).
  Pakistan drills province → district → tehsil from bundled TopoJSON; other countries show one level
  of regions fetched from geoBoundaries. `showProvince()` and the `province` signal let the region list
  beside it drive it; `failed` lets the page drop the map.
- `features/public/home/smooth-scroll.ts`: Lenis smooth wheel scrolling for this page only.
- `apps/web/public/landing/`: scene photos with 160 px thumbs, the host photo, the baked cloud images.

## How it works

- **Hero timeline** (`hero-clouds.ts`): each scene holds 6 s; the dot on the orbit ring is the timer.
  A change rolls three cloud layers (Web Animations), crossfades the photo, swaps the headline and
  flies the bee through the clouds. A click interrupts a running change (`halt()`), so the rail never
  ignores input. It pauses on hover/focus, off screen, in a background tab and once scrolled past 30 %.
  Reduced motion: no timeline, thumbs switch instantly, bee is a still image.
- **Bee in the hero**: one `<video>` (WebM with alpha) or, on WebKit, an `<img>` of the WebP. Plays
  `hello` then loops `hover`; switches to `search` only while the search bar is in use (hover, focus,
  or a popover open). See [mascot and boot splash](./mascot-and-boot-splash.md).
- **Header**: `layout/components/site-header/` floats over the hero on `/` (`hh-header-float`,
  `hh-header-overlay` in `apps/web/src/global.css`) and turns back into the white bar, with the search,
  past 80 % of the viewport height.
- **Search**: the hero and the closing band use the real `app-search-bar` (with an `hhsb-hero` variant
  in its own stylesheet). It has no phone layout, so below 768 px the hero shows a compact
  `hh-place-search` field and the closing band a plain "Browse stays" link.
- **Featured**: `ListingsApi.featured()` in the browser only; the section is hidden if nothing loads.

## Reuse, don't rebuild

- `app-search-bar`, `hh-listing-card`, `app-country-map`, `hh-mascot`: all the real components.
- The `hl-` / `hc-` class prefixes: these components are unencapsulated so the page can dress shared
  components; keep the prefix on anything new so nothing leaks.

## Traps

- **Per-component style budget is 8 kB** (`apps/web/project.json`). The page is split into section
  components partly to stay under it; adding styles to `home.scss` can fail the build.
- **Leaflet panes carry z-index 400+**: `.hl-map app-country-map` gets its own stacking context so
  the bee stays above the map.
- **The footer's `mt-16`** would show a white strip under the closing photo band; `global.css` zeroes
  it only when `main` contains `app-home`.
- **Animation cost**: do not reintroduce `mix-blend-mode`, CSS masks or `backdrop-filter` on large
  layers here. See the decisions below for the measurements.
- **Photos are AI-generated decorative scenes**: never present them as a real listing's photos.

## Decisions

- [Bake the clouds into transparent images](../decisions/landing-page/bake-clouds-into-transparent-images.md)
- [Frosted panels without a live backdrop blur](../decisions/landing-page/frosted-panels-without-backdrop-blur.md)
- [Smooth wheel scrolling with Lenis, on this page only](../decisions/landing-page/smooth-wheel-scrolling-landing-only.md)
- [The header floats over the hero](../decisions/landing-page/header-floats-over-the-hero.md)
- [Split the page into section components instead of raising the style budget](../decisions/landing-page/split-sections-not-raise-style-budget.md)

## See also

- [Search and discovery](./search-and-discovery.md) for the search bar and the place landing pages.
- [Mascot and boot splash](./mascot-and-boot-splash.md), [maps](./maps.md), [i18n](./i18n.md).
