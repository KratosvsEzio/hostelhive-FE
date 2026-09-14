import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  computed,
  inject,
  input,
  signal,
} from '@angular/core';
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
 *
 * Dismissal uses guarded `document` listeners, not a backdrop element — the same choice
 * `AccountMenu` documents, and here it is a correctness fix rather than a preference.
 *
 * The backdrop this replaced was `fixed inset-0`, which reads as "cover the viewport" and
 * did not. The header it lives in carries `backdrop-blur` (`site-header.html:2`), and a
 * `backdrop-filter` makes that ancestor the containing block for every `fixed` descendant
 * under it. So the backdrop resolved to the header's own box — measured at 1815×64 against
 * a 1830×940 viewport — and a click anywhere below the header, which is essentially the
 * whole page, missed it entirely. The panel could not be dismissed by clicking away, and
 * with no Escape handler either, a keyboard user's only exit was tabbing all eighteen
 * options. Listeners have no geometry, so there is nothing left for a containing block to
 * clip; Escape comes with them rather than needing to be remembered separately.
 *
 * If this ever moves back to a backdrop element, it has to be portalled to the body the way
 * `hh-dropdown` and `hh-date-range-picker` portal their panels, and for exactly this reason.
 */
@Component({
  selector: 'hh-language-switcher',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [Button],
  host: {
    '(document:click)': 'onDocumentClick($event)',
    '(document:keydown.escape)': 'onEscape()',
  },
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
                <span class="shrink-0 text-xs text-ink-500" dir="ltr">{{ l.englishName }}</span>
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
  private readonly host = inject(ElementRef<HTMLElement>);
  /**
   * Found by query rather than by a `#trigger` template reference.
   *
   * A local ref here is the obvious way to write this and it breaks hydration. The trigger
   * element is also the `hh-button` component's host, and annotating it with a local ref
   * shifted the node the server's hydration data pointed at, so the client looked for the
   * flag `<img>` and found `hh-button`'s own `@if` anchor comment instead — NG0500, which
   * kills the component subtree and leaves the control dead to every click. It fails only
   * against a server-rendered page, so unit tests pass either way.
   *
   * There is exactly one `<button>` in this template, so the query is unambiguous.
   */
  private readonly triggerEl = (): HTMLButtonElement | null =>
    this.host.nativeElement.querySelector('button');

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

  // The trigger sits inside the host, so its own (click) runs first: closing by trigger hits
  // the `!open()` return and opening hits the `contains()` return, so neither path re-toggles.
  protected onDocumentClick(event: MouseEvent): void {
    if (!this.open()) return;
    if (this.host.nativeElement.contains(event.target as Node)) return;
    this.open.set(false);
  }

  // Escape returns focus to the trigger, because the list is where the keyboard user is
  // standing and closing it would otherwise drop focus to the body. An outside click leaves
  // focus alone — the click already said where they want to be.
  protected onEscape(): void {
    if (!this.open()) return;
    this.open.set(false);
    this.triggerEl()?.focus();
  }

  protected choose(code: string): void {
    this.open.set(false);
    this.store.switchTo(code);
  }
}
