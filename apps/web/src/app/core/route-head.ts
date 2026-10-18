import { Injectable, Injector, effect, inject, signal, untracked } from '@angular/core';
import {
  ActivatedRouteSnapshot,
  PRIMARY_OUTLET,
  RouterStateSnapshot,
  TitleStrategy,
} from '@angular/router';
import { TranslocoService } from '@jsverse/transloco';
import { LocaleStore } from './i18n/locale-store';
import { routePath } from './i18n/locales';
import { Seo } from './seo';

/**
 * Who writes the head of a route, declared as route data `head`.
 *
 * - `'page'` — the component calls `Seo.apply` itself, from an effect, and owns the whole
 *   head, its title included. The route-level default stays out of its way entirely, so a
 *   `'page'` route declares no `title:`.
 * - `'index'` — a static page worth indexing that has no head of its own (about, FAQs, the
 *   legal pages). It gets its own canonical, `og:url` and hreflang from its path.
 * - absent — everything else: auth, account, consoles, notifications. `noindex`, with no
 *   canonical and no `og:url`. Leaving a route out is the safe direction to be wrong in: a
 *   forgotten flag costs a page its ranking, never leaks a private one into the index.
 */
export type RouteHeadKind = 'page' | 'index';

/** What a route declares about its head, read from the matched route tree. */
export interface RouteHead {
  head?: RouteHeadKind;
  /**
   * Transloco key of the meta description for an `'index'` route. Without one it gets the
   * translated site default.
   */
  descriptionKey?: string;
}

/** The head the route-level default will apply once the strings are in memory. */
interface PendingHead {
  /**
   * Transloco key of the route's label — its `title:` — or empty when it declares none.
   * Kept as the key, not its translation: the strings may not be loaded yet when it is set.
   */
  titleKey: string;
  /** Under the admin console, whose titles carry their own template. */
  admin: boolean;
  noindex: boolean;
  path?: string;
  descriptionKey?: string;
}

/**
 * Reads `head` and `descriptionKey` from the matched routes, the way `buildTitle` reads
 * `title`: down the primary outlet, the deepest route that declares a key wins.
 *
 * Read off `routeConfig.data` rather than the snapshot's merged `data`, so a value comes
 * from the route that wrote it and not from Angular's inheritance rules — which differ for
 * empty-path and componentless parents. A flag on a parent (`blog`, `hostel`) therefore
 * covers every child below it unless a child says otherwise.
 */
export function routeHeadFor(snapshot: RouterStateSnapshot): RouteHead {
  const found: RouteHead = {};
  let route: ActivatedRouteSnapshot | undefined = snapshot.root;
  while (route) {
    const data = route.routeConfig?.data;
    if (data?.['head'] !== undefined) found.head = data['head'] as RouteHeadKind;
    if (data?.['descriptionKey'] !== undefined) {
      found.descriptionKey = data['descriptionKey'] as string;
    }
    route = route.children.find((child) => child.outlet === PRIMARY_OUTLET);
  }
  return found;
}

/**
 * The matched route's URL, rebuilt from the segments' `path` alone.
 *
 * Not `snapshot.url`: that string still carries matrix params (`/en/about;utm=x`), which the
 * router matches to the same route, so each one would mint an indexable duplicate with its own
 * canonical. A segment's `path` never includes them.
 */
function matchedUrl(snapshot: RouterStateSnapshot): string {
  const paths: string[] = [];
  let route: ActivatedRouteSnapshot | undefined = snapshot.root;
  while (route) {
    for (const segment of route.url) paths.push(segment.path);
    route = route.children.find((child) => child.outlet === PRIMARY_OUTLET);
  }
  return `/${paths.join('/')}`;
}

/**
 * Gives every route a head that describes it, including the ones whose page never asks.
 *
 * Without this only the pages that call `Seo.apply` ever wrote one. Every other route kept
 * what was there before it: on a server render that was `index.html`'s home-page head —
 * so `/en/about` declared itself a copy of the home page — and after a client navigation it
 * was the previous page's canonical, robots and description.
 *
 * A `TitleStrategy` because that is the one hook the router calls on every navigation that
 * lands, after the new components exist, with the final route tree — redirects and guards
 * already resolved, lazy children already loaded.
 *
 * **The title is part of the head, and nothing here writes it directly.** A route's
 * `title:` is a Transloco key naming the page ("common.faqs"), not the title itself; the
 * effect below translates it and composes `seo.pageTitle` — or `seo.adminPageTitle` in the
 * admin console — and hands the result to `Seo.apply` with the rest of the head. So the
 * title is always in the same language as the description beside it.
 *
 * It used to be set synchronously here, on the belief that Google Analytics reads
 * `document.title` straight after `NavigationEnd`. It does not: analytics reads after the
 * first change-detection tick, by which point every head effect has run — and it now waits
 * for `Seo.settled` besides. The early write bought nothing and cost two things. It could
 * only be the untranslated literal, since a language switch navigates before the new
 * strings arrive. And on a `'page'` route it overwrote the page's own title on every
 * navigation, including query-only ones the page's effect does not re-run for — leaving
 * the generic route title in the tab for good.
 *
 * **The head waits for an effect.** It is translated, and a language switch navigates
 * before the new language's strings have arrived — applied here, synchronously, it would
 * read the keys back. The effect waits on `LocaleStore.ready()` and re-runs when the
 * language changes, the same gate every page's own `apply` uses.
 *
 * A `'page'` route clears the pending head instead, and its component's effect — which runs
 * after this — writes the whole head, its title included. One owner per navigation.
 */
@Injectable()
export class RouteHeadStrategy extends TitleStrategy {
  // Resolved lazily: the router constructs this while it is itself being constructed, and
  // `Seo` and `LocaleStore` both reach back to the router — injecting them here is a cycle.
  private readonly injector = inject(Injector);

  private readonly pending = signal<PendingHead | null>(null);

  constructor() {
    super();
    effect(() => {
      const head = this.pending();
      if (!head) return;
      const locale = this.injector.get(LocaleStore);
      if (!locale.ready()) return;
      // Read so a language switch re-applies: `ready()` can stay true across one.
      locale.active();
      untracked(() => this.applyDefault(head));
    });
  }

  /**
   * Records the head this navigation should get; writes nothing itself — see the class
   * comment for why not even the title.
   */
  override updateTitle(snapshot: RouterStateSnapshot): void {
    const { head, descriptionKey } = routeHeadFor(snapshot);
    if (head === 'page') {
      // The page owns its title too: a route title here would only ever compete with it.
      this.pending.set(null);
      // The page clears its own blocks when it goes, but a server page the browser never
      // created cannot — see `Seo.clearUnclaimed`.
      this.injector.get(Seo).clearUnclaimed();
      return;
    }
    const url = routePath(matchedUrl(snapshot));
    // A new object every time, so a query-only navigation or a revisit re-applies too.
    this.pending.set({
      titleKey: this.buildTitle(snapshot) ?? '',
      // Matched on the language-free path: every URL carries a prefix (`/ur/admin/...`).
      admin: url === '/admin' || url.startsWith('/admin/'),
      noindex: head !== 'index',
      path: head === 'index' ? url : undefined,
      descriptionKey,
    });
  }

  private applyDefault(head: PendingHead): void {
    const seo = this.injector.get(Seo);
    const i18n = this.injector.get(TranslocoService);
    seo.apply({
      // Empty falls back to the translated site title inside `apply`.
      title: head.titleKey
        ? i18n.translate<string>(head.admin ? 'seo.adminPageTitle' : 'seo.pageTitle', {
            page: i18n.translate<string>(head.titleKey),
          })
        : '',
      description: head.descriptionKey ? i18n.translate<string>(head.descriptionKey) : undefined,
      path: head.path,
      noindex: head.noindex,
    });
    // No page owns this route, so nothing on it wrote structured data or a preload. Whatever
    // is there belongs to a page that has gone.
    seo.clearAllJsonLd();
    seo.preloadImage(null);
  }
}
