import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  signal,
} from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { Button } from '@hostelhive/ui';
import { LocaleStore } from './locale-store';
import { LOCALES, flagSrc, localeFor } from './locales';

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
  imports: [Button, TranslocoPipe],
  template: `
    <div class="relative">
      <!--
        Reads as a control rather than a caption. It sat as bare text beside the solid
        avatar, which made the one thing a visitor who cannot read the page needs to find
        the least button-like item in the header.

        A filled button in the default colour already is this pill — border, background and a hover
        that darkens rather than fighting it — so nothing here overrides the component.
      -->
      <button
        hh-button
        variant="filled"
        size="sm"
        type="button"
        [class]="triggerClass()"
        (click)="open.set(!open())"
        [attr.aria-expanded]="open()"
        aria-haspopup="listbox"
        [attr.aria-label]="'Language: ' + current().englishName"
      >
        <img
          [src]="flagSrc(current())"
          alt=""
          aria-hidden="true"
          width="20"
          height="15"
          class="h-[15px] w-5 shrink-0 rounded-[2px] object-cover"
        />
        <span>{{ current().name }}</span>
      </button>

      @if (open()) {
        <button
          type="button"
          class="fixed inset-0 z-[70] cursor-default"
          [attr.aria-label]="'a11y.close' | transloco"
          (click)="open.set(false)"
        ></button>
        <ul
          role="listbox"
          [class]="panelClass()"
        >
          @for (l of locales; track l.code) {
            <li>
              <button
                type="button"
                role="option"
                [attr.aria-selected]="l.code === current().code"
                [attr.lang]="l.code"
                class="flex w-full items-center justify-between gap-3 px-3 py-2 text-start text-sm transition hover:bg-surface"
                [class.text-brand-600]="l.code === current().code"
                [class.font-medium]="l.code === current().code"
                (click)="choose(l.code)"
              >
                <span class="flex min-w-0 items-center gap-2.5">
                  <!-- Decoration beside the name, never the label: a flag names a country,
                       and the row is identified by its endonym and English name. -->
                  <img
                    [src]="flagSrc(l)"
                    alt=""
                    aria-hidden="true"
                    width="20"
                    height="15"
                    loading="lazy"
                    class="h-[15px] w-5 shrink-0 rounded-[2px] object-cover"
                  />
                  <!-- Direction belongs on the text, not on the row. The row deliberately
                       inherits the page's direction so all eighteen options share one
                       layout: on an English page every flag is on the left and every
                       English name on the right, and on an Urdu page the whole list
                       mirrors together. Setting it per row instead flipped Urdu and Arabic
                       out of line with the sixteen around them, which is a picker somebody
                       has to read twice. Kept here because it decides where the ellipsis
                       lands if a name is ever long enough to clip. -->
                  <span class="truncate" [attr.dir]="l.dir">{{ l.name }}</span>
                </span>
                <span class="shrink-0 text-xs text-ink-400" dir="ltr">{{ l.englishName }}</span>
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

  /**
   * Which side of the trigger the list opens on.
   *
   * Stated by the caller rather than measured, because the two placements this control has
   * are not close calls: in the header there is a page below it, and in the footer there is
   * nothing below it at all. A list that opened downward from the footer would render past
   * the end of the document, where it cannot be scrolled to.
   */
  readonly placement = input<'below' | 'above'>('below');

  /**
   * Which edge of the trigger the list lines up with.
   *
   * Follows the trigger's own position on the page, and gets it wrong in exactly one
   * direction: aligned to the far edge, a 16rem list hangs off the side of the window. The
   * header sits at the end of its row so `'end'` keeps it on screen; the footer sits at the
   * start of its row, where the same value ran the list off the opposite edge.
   */
  readonly align = input<'start' | 'end'>('end');

  /**
   * Which surface the trigger sits on.
   *
   * The button's own `color="dark"` means a dark-*coloured* control, which on a dark
   * background is dark text on dark. This says where the control is instead, so the dark
   * variant borrows the footer's own vocabulary — `ink-700` rules, `ink-300` links, white
   * on hover — rather than dropping a white pill onto it.
   */
  readonly surface = input<'light' | 'dark'>('light');

  protected readonly locales = LOCALES;
  protected readonly flagSrc = flagSrc;
  protected readonly open = signal(false);
  protected readonly current = computed(() => localeFor(this.store.active()));

  /**
   * `!` because these override `hh-button`'s own filled styles rather than sitting beside
   * them — the same reason `!rounded-full` is here, which the pill shape needs in both tones.
   */
  protected readonly triggerClass = computed(() =>
    this.surface() === 'dark'
      ? '!rounded-full !border !border-ink-600 !bg-transparent !text-ink-200 ' +
        'hover:!border-ink-400 hover:!text-white'
      : '!rounded-full',
  );

  protected readonly panelClass = computed(() => {
    const base =
      'absolute z-[80] max-h-80 w-64 overflow-y-auto rounded-xl ' +
      'border border-ink-100 bg-white py-1 shadow-pill';
    const side = this.align() === 'start' ? 'start-0' : 'end-0';
    const vertical = this.placement() === 'above' ? 'bottom-full mb-2' : 'mt-2';
    return `${base} ${side} ${vertical}`;
  });

  protected choose(code: string): void {
    this.open.set(false);
    this.store.switchTo(code);
  }
}
