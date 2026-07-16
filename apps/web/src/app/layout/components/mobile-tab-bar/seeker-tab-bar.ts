import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';

/**
 * Bottom tab bar for the seeker area of the mobile app (design boards 40–41):
 * Explore · Search · Favorites · Account. Rendered by the root App component
 * when `MobileApp.isMobile` is true and the route is outside the consoles.
 * Fixed to the bottom edge with safe-area padding for the home indicator.
 */
@Component({
  selector: 'app-seeker-tab-bar',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, RouterLinkActive],
  styles: `
    :host { display: block; }
    .tab {
      flex: 1;
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 2px;
      padding: 4px 0 6px;
      font-size: 10px;
      font-weight: 500;
      color: #a3a3a3;
      text-decoration: none;
    }
    .tab.on { color: #f36e21; }
  `,
  template: `
    <nav
      class="safe-pb fixed inset-x-0 bottom-0 z-40 border-t border-ink-100 bg-white"
      aria-label="Main"
    >
      <div class="flex px-2 pt-1.5">
        <a
          routerLink="/"
          routerLinkActive="on"
          [routerLinkActiveOptions]="{ exact: true }"
          class="tab"
        >
          <i class="ti ti-home text-xl" aria-hidden="true"></i>Explore
        </a>
        <a routerLink="/search" routerLinkActive="on" class="tab">
          <i class="ti ti-search text-xl" aria-hidden="true"></i>Search
        </a>
        <a routerLink="/account/favorites" routerLinkActive="on" class="tab">
          <i class="ti ti-heart text-xl" aria-hidden="true"></i>Favorites
        </a>
        <a routerLink="/account/settings" routerLinkActive="on" class="tab">
          <i class="ti ti-user text-xl" aria-hidden="true"></i>Account
        </a>
      </div>
    </nav>
  `,
})
export class SeekerTabBar {}
