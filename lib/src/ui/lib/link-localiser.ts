import { InjectionToken } from '@angular/core';

/** What Angular's `routerLink` accepts, and therefore what this token rewrites. */
export type HhLinkCommands = string | readonly unknown[] | null | undefined;

/**
 * How a shared component keeps a link inside the active language.
 *
 * The app keeps links in-language with a directive matching `a[routerLink]`. Angular matches
 * directives against the *declaring* component's imports, so that one reaches every template
 * in the app and none of the templates in here. A library component that builds its own
 * `routerLink` therefore renders an href with no language prefix — the click still lands,
 * because the router redirects a bare path to its prefixed twin, but copy-link-address,
 * middle-click and anything reading the markup all take the unprefixed URL.
 *
 * A token rather than a dependency on the app's i18n, because the library must not know what
 * a locale is — the same reason `LEAFLET_MAPS_CONFIG` is shaped this way. The default is
 * identity, so a component behaves correctly with no provider at all: in Storybook, in tests,
 * and in any app whose URLs carry no prefix.
 *
 * An implementation is expected to read its locale from a signal, so that a component calling
 * this inside a `computed` re-runs when the language changes. Links already on the page have
 * to follow a language switch; otherwise the header you switched on still points at the old one.
 */
export const HH_LINK_LOCALISER = new InjectionToken<(link: HhLinkCommands) => HhLinkCommands>(
  'HH_LINK_LOCALISER',
  { providedIn: 'root', factory: () => (link: HhLinkCommands) => link },
);
