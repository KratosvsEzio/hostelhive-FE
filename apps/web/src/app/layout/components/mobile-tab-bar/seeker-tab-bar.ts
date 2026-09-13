import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { LocaleLink } from '@core/i18n/locale-link';

/**
 * Bottom tab bar for the seeker area of the mobile app (design boards 40–41):
 * Explore · Search · Favorites · Account. Rendered by the root App component
 * when `MobileApp.isMobile` is true and the route is outside the consoles.
 * Fixed to the bottom edge with safe-area padding for the home indicator.
 */
@Component({
  selector: 'app-seeker-tab-bar',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [TranslocoPipe, RouterLink, LocaleLink, RouterLinkActive],
  /**
   * Colours and weight, not colour alone.
   *
   * This was `#a3a3a3` on white — **2.52:1**, against 4.5:1 for text and 3:1 for the 20px
   * icons that inherit it. The active tab was `#f36e21` at **2.95:1**, so the two states
   * differed from each other by 1.17:1: on a mid-range Android outdoors, or with any colour
   * vision deficiency, "which tab am I on" had no answer. Below 768px this is the only
   * navigation the product has.
   *
   * `ink-500` is 7.82:1 and `brand-700` is 6.05:1, both already in the palette. The weight
   * change is what carries the state without relying on hue at all — paired with
   * `aria-current="page"` in the template, which is the same cue for a screen reader.
   *
   * 11px rather than 10px: these are the smallest labels in the product, on the smallest
   * screens, and the row has room for it at four tabs.
   */
  styles: `
    :host { display: block; }
    .tab {
      position: relative;
      flex: 1;
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 2px;
      padding: 4px 0 6px;
      font-size: 11px;
      font-weight: 500;
      color: #525252;
      text-decoration: none;
    }
    .tab.on {
      color: #a8430c;
      font-weight: 600;
    }
    /* The cue that survives colour being removed.
       Weight alone was not enough: 500 to 600 at 11px is about a third of a pixel of stroke,
       and the two colours are only 1.29:1 apart in luminance — so to a reader with a
       colour-vision deficiency the active tab was indistinguishable. A 2px rule is the
       convention the audience's own Android navigation already uses.
       inset-inline rather than left/right, so it mirrors in Urdu and Arabic.
       No backticks in this comment: it sits inside a JS template literal. */
    .tab.on::before {
      content: '';
      position: absolute;
      top: 0;
      inset-inline: 25%;
      height: 2px;
      border-radius: 1px;
      background: #a8430c;
    }
  `,
  template: `
    <nav
      class="safe-pb fixed inset-x-0 bottom-0 z-40 border-t border-ink-100 bg-white"
      [attr.aria-label]="'a11y.mainNavigation' | transloco"
    >
      <div class="flex px-2 pt-1.5">
        <a
          routerLink="/"
          routerLinkActive="on"
          #explore="routerLinkActive"
          [routerLinkActiveOptions]="{ exact: true }"
          class="tab"
          [attr.aria-current]="explore.isActive ? 'page' : null"
        >
          <i class="ti ti-home text-xl" aria-hidden="true"></i>{{ 'nav.explore' | transloco }}
        </a>
        <a routerLink="/search" routerLinkActive="on" #search="routerLinkActive" class="tab" [attr.aria-current]="search.isActive ? 'page' : null">
          <i class="ti ti-search text-xl" aria-hidden="true"></i>{{ 'common.search' | transloco }}
        </a>
        <a routerLink="/account/favorites" routerLinkActive="on" #favs="routerLinkActive" class="tab" [attr.aria-current]="favs.isActive ? 'page' : null">
          <i class="ti ti-heart text-xl" aria-hidden="true"></i>{{ 'common.favorites' | transloco }}
        </a>
        <a routerLink="/account/settings" routerLinkActive="on" #acct="routerLinkActive" class="tab" [attr.aria-current]="acct.isActive ? 'page' : null">
          <i class="ti ti-user text-xl" aria-hidden="true"></i>{{ 'common.account' | transloco }}
        </a>
      </div>
    </nav>
  `,
})
export class SeekerTabBar {}
