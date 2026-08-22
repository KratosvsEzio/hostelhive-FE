import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  signal,
} from '@angular/core';
import { Router } from '@angular/router';
import { Button } from '@hostelhive/ui';
import { LocaleStore } from './locale-store';
import { LOCALES, localeFor, splitLocale, withLocale } from './locales';

/**
 * Language picker.
 *
 * Choosing a language **navigates** rather than only swapping strings in place. The URL
 * is what makes a language real: it is what gets shared, bookmarked and indexed, and a
 * page that says Urdu while the address bar says English is a page nobody can send to
 * anyone. The choice is also remembered, so the next visit starts in the right language
 * without the visitor having to find this control again.
 *
 * Options are labelled with each language's own name — someone escaping a language they
 * cannot read is not helped by a list written in it.
 */
@Component({
  selector: 'hh-language-switcher',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [Button],
  template: `
    <div class="relative">
      <button
        hh-button
        variant="text"
        size="sm"
        type="button"
        (click)="open.set(!open())"
        [attr.aria-expanded]="open()"
        aria-haspopup="listbox"
        [attr.aria-label]="'Language: ' + current().englishName"
      >
        <i class="ti ti-world text-base" aria-hidden="true"></i>
        <span>{{ current().name }}</span>
      </button>

      @if (open()) {
        <button
          type="button"
          class="fixed inset-0 z-[70] cursor-default"
          aria-label="Close"
          (click)="open.set(false)"
        ></button>
        <ul
          role="listbox"
          class="absolute end-0 z-[80] mt-2 max-h-80 w-56 overflow-y-auto rounded-xl border border-ink-100 bg-white py-1 shadow-pill"
        >
          @for (l of locales; track l.code) {
            <li>
              <button
                type="button"
                role="option"
                [attr.aria-selected]="l.code === current().code"
                [attr.lang]="l.code"
                [attr.dir]="l.dir"
                class="flex w-full items-center justify-between gap-3 px-3 py-2 text-start text-sm transition hover:bg-surface"
                [class.text-brand-600]="l.code === current().code"
                [class.font-medium]="l.code === current().code"
                (click)="choose(l.code)"
              >
                <span>{{ l.name }}</span>
                <span class="text-xs text-ink-400" dir="ltr">{{ l.englishName }}</span>
              </button>
            </li>
          }
        </ul>
      }
    </div>
  `,
})
export class LanguageSwitcher {
  private readonly store = inject(LocaleStore);
  private readonly router = inject(Router);

  protected readonly locales = LOCALES;
  protected readonly open = signal(false);
  protected readonly current = computed(() => localeFor(this.store.active()));

  protected choose(code: string): void {
    this.open.set(false);
    if (code === this.store.active()) return;

    // Remember before navigating: `LocaleSync` reads the URL on the resulting
    // NavigationEnd, and the stored value is what survives to the next visit.
    this.store.apply(code, true);

    const url = this.router.url;
    const { path } = splitLocale(url);
    const query = url.includes('?') ? url.slice(url.indexOf('?')) : '';
    void this.router.navigateByUrl(withLocale(code, path) + query);
  }
}
