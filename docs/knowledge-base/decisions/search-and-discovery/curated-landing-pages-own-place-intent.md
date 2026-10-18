# Curated `/hostels/:place` pages own each place; `/search` canonicalises to them or is `noindex`

**Status:** Accepted
**Area:** [search-and-discovery](../../area/search-and-discovery.md)

## Context

Search can be scoped to any coordinate, so any place × gender × budget × amenity combination could be a URL. Once readable `/search/:location` URLs arrived (PR #29), `/search/lahore` and `/hostels/lahore` answered the same query and would compete for it in search engines.

## Decision

- Landing pages exist only for hand-curated entries: `PLACES` (10 cities) and `UNIVERSITIES` (campuses). Each carries a unique `blurb`; its slug is permanent once indexed. A gender segment (`girls`, `boys`, `co-living`) or a campus slug may follow the city.
- `PlaceLanding` embeds the real `SearchMap` with a `seed` rather than reimplementing search, and owns the `<head>` (title, canonical, breadcrumb and FAQ JSON-LD).
- `SearchMap` head rules: an unfiltered search for a curated place stays indexable with canonical `/hostels/<slug>`; any filtered search, an uncurated place, "search everywhere", or a view is `noindex` with **no** canonical. A view is a search link that arrives carrying a viewport (all four `ne_*`/`sw_*` keys valid), or a map that no longer frames the place (Trello #160; [viewport links are views](./viewport-links-are-views-not-pages.md)).
- The sitemap is derived from `PLACES`, `GENDER_SEGMENTS`, `UNIVERSITIES` and the blog archive, never hand-listed, and excludes `/search` and `/hostel/:id`.

## Alternatives rejected

- **Generate a page per place/area/filter.** Thousands of near-empty faceted URLs; crawlers spend the budget on them and rank the good pages lower (`places.ts`, `universities.ts` doc comments).
- **Canonicalise filtered searches to the landing page.** That claims a facet *is* the landing page; `noindex` describes it truthfully (`search-map.ts`, PR #29 body).
- **Canonicalise viewport links to the landing page.** The same reasoning as facets: once a box exists the request searches the box, not the place (`query()` drops `near` and `city`), so even a link that frames the place lists a sub-area or a wider one. Claiming it *is* the landing page misdescribes it, and a far link would hand the landing page's signal to unrelated hostels, as it did before (Trello #160, PR #184). The landing page itself has the same shape, filed as Trello #201.
- **Ship readable search URLs and landing pages separately.** They had to land together or the two URL families would compete (PR #29 "Supersedes #24").
- **List `/search` URLs in the sitemap.** Contradicts their own `noindex`/canonical (`sitemap-urls.ts`).

## Consequences

- Adding a city or campus is a code change to `places.ts` / `universities.ts`; the sitemap and `/search/<slug>` resolution follow automatically.
- Listing pages (`/hostel/:id`) are not in the sitemap: the search payload has no slug, so their URLs are opaque ids.
- Home's popular-city links point at `/hostels/<slug>` to reinforce the landing page.

## Evidence

- `apps/web/src/app/features/public/landing/places.ts`, `apps/web/src/app/features/public/landing/universities.ts`, `apps/web/src/app/features/public/landing/place-landing.ts`, `apps/web/src/app/features/public/landing/sitemap-urls.ts`
- `apps/web/src/app/features/public/search/search-map/search-map.ts` (the SEO `effect` in the constructor, `canonicalPlace`, `hasFilters`)
- PR #29 "feat(seo,search): landing pages, structured data, and readable /search/:location URLs" (KratosvsEzio/hostelhive-FE)
