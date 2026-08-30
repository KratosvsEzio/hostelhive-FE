import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';
import { LocaleLink } from '@core/i18n/locale-link';

/** One destination, matching the shape the staff shell's sidebar already builds. */
export interface StaffTab {
  label: string;
  icon: string;
  link: string;
}

/**
 * Bottom tab bar for the moderator and admin consoles.
 *
 * Rendered by StaffLayout when `MobileApp.isMobile` is true — which is any viewport under
 * 768px, not only the packaged app. Below that width the shell's fixed sidebar is not
 * rendered at all, so these tabs are the whole of staff navigation on a phone.
 *
 * **Takes its destinations as an input** rather than declaring them, unlike the host bar.
 * The staff shell already builds one list per console and filters it by permission, so a
 * second copy here would be two places to add a page to and one place to forget. It also
 * means a moderator gets two tabs and an admin five from the same component, and a sub-user
 * who cannot open a page is never offered it.
 *
 * No "More" overflow: the longest list is five, which is what a tab bar holds. Should a
 * sixth destination arrive, that is the moment to add one rather than to let the labels
 * shrink until they cannot be read.
 */
@Component({
  selector: 'app-staff-tab-bar',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, LocaleLink, RouterLinkActive],
  styles: `
    :host { display: block; }
    .tab {
      flex: 1;
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 2px;
      padding: 4px 2px 6px;
      font-size: 10px;
      font-weight: 500;
      color: #a3a3a3;
      text-decoration: none;
      min-width: 0;
    }
    /* Five labels across 375px leaves about 68px each; "Roles & permissions" needs the
       ellipsis rather than a second line that would make one tab taller than its neighbours. */
    .tab span {
      max-width: 100%;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .tab.on { color: #f36e21; }
  `,
  template: `
    <nav class="safe-pb fixed inset-x-0 bottom-0 z-40 border-t border-ink-100 bg-white" [attr.aria-label]="ariaLabel()">
      <div class="flex px-1 pt-1.5">
        @for (tab of tabs(); track tab.link) {
          <a [routerLink]="tab.link" routerLinkActive="on" class="tab">
            <i class="ti text-xl" [class]="tab.icon" aria-hidden="true"></i>
            <span>{{ tab.label }}</span>
          </a>
        }
      </div>
    </nav>
  `,
})
export class StaffTabBar {
  readonly tabs = input<StaffTab[]>([]);
  /** "Moderator console" or "Admin console" — the shell knows which it is rendering. */
  readonly ariaLabel = input('Console');
}
