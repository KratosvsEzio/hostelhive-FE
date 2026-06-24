import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  PLATFORM_ID,
  effect,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Editor, NgxEditorModule, Toolbar } from 'ngx-editor';

/** Curated emoji set for the picker — common smileys, gestures, hearts, and hostel-relevant icons. */
const EMOJIS = [
  '😀',
  '😃',
  '😄',
  '😁',
  '😆',
  '😅',
  '😂',
  '🤣',
  '😊',
  '😇',
  '🙂',
  '🙃',
  '😉',
  '😌',
  '😍',
  '🥰',
  '😘',
  '😋',
  '😎',
  '🤩',
  '🥳',
  '🤗',
  '🤔',
  '😴',
  '👍',
  '👎',
  '👏',
  '🙌',
  '🙏',
  '💪',
  '👋',
  '🤝',
  '✌️',
  '👌',
  '🫶',
  '💯',
  '❤️',
  '🧡',
  '💛',
  '💚',
  '💙',
  '💜',
  '🖤',
  '🤍',
  '✨',
  '⭐',
  '🔥',
  '🎉',
  '✅',
  '❌',
  '⚠️',
  '📍',
  '📞',
  '📧',
  '🔑',
  '💰',
  '🎓',
  '📚',
  '🌟',
  '☀️',
  '🏠',
  '🏡',
  '🏢',
  '🛏️',
  '🚿',
  '🍽️',
  '📶',
  '🧹',
  '🧺',
  '🪴',
  '🛋️',
  '🚪',
];

/**
 * Rich-text editor (ngx-editor / ProseMirror) with an emoji picker — the design-system
 * replacement for plain `<textarea>`s. Value is an **HTML string** in/out (`outputFormat="html"`);
 * render stored values with a sanitized `[innerHTML]` inside a `.hh-rich` container.
 *
 * SSR: ProseMirror touches `document`, so the editor only renders in the browser (a placeholder
 * shows on the server) and the host is `ngSkipHydration` to avoid a hydration mismatch.
 *
 * `<hh-rich-text [value]="html()" (valueChange)="html.set($event)" placeholder="…" />`
 */
@Component({
  selector: 'hh-rich-text',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ReactiveFormsModule, NgxEditorModule],
  host: {
    ngSkipHydration: 'true',
    class: 'block',
    '(document:click)': 'onDocumentClick($event)',
  },
  template: `
    @if (isBrowser) {
      <div class="hh-rich-wrap" [style.--editor-min-h.px]="minHeight()">
        <ngx-editor-menu [editor]="editor" [toolbar]="toolbar" />
        <ngx-editor
          [editor]="editor"
          [formControl]="ctrl"
          outputFormat="html"
          [placeholder]="placeholder()"
        />
        <button
          type="button"
          class="hh-emoji-btn"
          (click)="toggleEmoji()"
          aria-label="Insert emoji"
          aria-haspopup="true"
          [attr.aria-expanded]="emojiOpen()"
        >
          <span aria-hidden="true">😀</span>
        </button>
        @if (emojiOpen()) {
          <div class="hh-emoji-pop" role="menu" aria-label="Emoji">
            @for (e of emojis; track e) {
              <button
                type="button"
                class="hh-emoji-item"
                (click)="insertEmoji(e)"
                [attr.aria-label]="'Insert ' + e"
              >
                {{ e }}
              </button>
            }
          </div>
        }
      </div>
    } @else {
      <!-- SSR placeholder — the editor hydrates client-side (ngSkipHydration). -->
      <div
        class="hh-input"
        [style.minHeight.px]="minHeight()"
        aria-hidden="true"
      ></div>
    }
  `,
})
export class RichText {
  /** Current value as an HTML string. */
  readonly value = input<string | null>('');
  /** Placeholder shown when empty. */
  readonly placeholder = input('');
  /** Minimum editor height in px. */
  readonly minHeight = input(120);
  /** Emits the HTML string on every edit. */
  readonly valueChange = output<string>();

  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly destroyRef = inject(DestroyRef);
  protected readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));

  /** Only initialised in the browser — undefined on the server. */
  protected editor!: Editor;
  /** Drives ngx-editor via its ControlValueAccessor (outputFormat="html" → string values). */
  protected readonly ctrl = new FormControl<string>('', { nonNullable: true });

  protected readonly emojiOpen = signal(false);
  protected readonly emojis = EMOJIS;

  protected readonly toolbar: Toolbar = [
    ['bold', 'italic', 'underline', 'strike'],
    ['code', 'blockquote'],
    ['ordered_list', 'bullet_list'],
    [{ heading: ['h1', 'h2', 'h3'] }],
    ['link'],
    ['text_color', 'background_color'],
    ['align_left', 'align_center', 'align_right', 'align_justify'],
  ];

  private lastEmitted = '';

  constructor() {
    if (!this.isBrowser) return;

    this.editor = new Editor();
    this.destroyRef.onDestroy(() => this.editor.destroy());

    // External value → control. Skip our own just-emitted value so the CVA doesn't re-paste the
    // HTML and bump the caret while typing.
    effect(() => {
      const html = this.value() ?? '';
      if (html !== this.lastEmitted) {
        this.lastEmitted = html;
        this.ctrl.setValue(html, { emitEvent: false });
      }
    });

    // Edits → normalise empty-paragraph HTML to a clean empty string, then emit.
    this.ctrl.valueChanges
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((html) => {
        const normalized = normalizeHtml(html);
        this.lastEmitted = normalized;
        this.valueChange.emit(normalized);
      });
  }

  protected toggleEmoji(): void {
    this.emojiOpen.update((o) => !o);
  }

  protected insertEmoji(emoji: string): void {
    if (this.editor?.view) {
      const { state, dispatch } = this.editor.view;
      dispatch(state.tr.insertText(emoji));
    }
    this.emojiOpen.set(false);
  }

  protected onDocumentClick(e: MouseEvent): void {
    if (
      this.emojiOpen() &&
      !this.host.nativeElement.contains(e.target as Node)
    ) {
      this.emojiOpen.set(false);
    }
  }
}

/** Normalise ngx-editor's empty-document HTML (`<p></p>`) to a clean empty string. */
function normalizeHtml(html: string): string {
  const t = (html ?? '').trim();
  return t === '<p></p>' || t === '' ? '' : t;
}
