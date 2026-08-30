import {
  ChangeDetectionStrategy,
  Component,
  computed,
  input,
  model,
} from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';

export interface TabItem {
  /** A literal label. For anything the user reads in their own language, use {@link labelKey}. */
  label?: string;
  /**
   * A translation key, resolved here by the pipe.
   *
   * Callers used to translate the label themselves and hand over the finished string. That
   * put an imperative `translate()` inside a computed, which runs before the language file
   * has loaded — so the first pass logged "Missing translation" and returned the key itself,
   * and every such caller had to depend on a `ready` signal to force a second pass once the
   * strings landed. The pipe waits on its own; none of that ceremony is needed.
   */
  labelKey?: string;
  value: string;
}

/**
 * Segmented tab control. `<hh-tabs [tabs]="tabs" [(active)]="view" />`
 *
 * Every tab is a filled chip, the unselected ones a shade duller. They used to be bare text
 * beside the selected chip, which read as one button with some labels next to it rather than
 * a control with a choice in it — the other options did not look pressable, so they did not
 * look like options.
 *
 * Selected comes *forward* — white, the lightest fill, with a shadow — and the rest sit back
 * into the track. That way the difference is depth rather than only colour, which is what
 * survives being read quickly, in bright light, or by someone who does not separate these two
 * greys.
 */
@Component({
  selector: 'hh-tabs',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [TranslocoPipe],
  template: `
    @for (tab of tabs(); track tab.value) {
      <button
        type="button"
        role="tab"
        [attr.aria-selected]="tab.value === active()"
        (click)="active.set(tab.value)"
        [class]="btnClass(tab.value)"
      >
        {{ tab.labelKey ? (tab.labelKey | transloco) : tab.label }}
      </button>
    }
  `,
  host: {
    // `gap-1` so the chips read as separate buttons now that they all carry a fill; touching
    // them made two filled chips look like one bar split by a colour change.
    class: 'grid gap-1 rounded-xl bg-surface p-1 font-medium',
    '[class]': 'hostTextClass()',
    '[style.grid-template-columns]': 'cols()',
    // A control offering one option is not a control. Whichever tab is showing is the only
    // tab there is, so the chip says nothing the heading below it does not, and a lone
    // "Details" pill invites a host to look for the other one.
    //
    // Hidden here rather than at each call site because the callers cannot all know: this
    // one's tab list is computed — a monthly-billing hostel has no calendar to show — so the
    // count is only known at render, and every caller would need the same guard around it.
    //
    // `display` rather than a `hidden` class: the host class already sets `grid`, and both
    // are display utilities of equal specificity, so which one won would come down to the
    // order Tailwind happened to emit them in. An inline style has no such argument.
    '[style.display]': 'tabs().length > 1 ? null : "none"',
    role: 'tablist',
  },
})
export class Tabs {
  readonly tabs = input<TabItem[]>([]);
  readonly active = model('');
  readonly size = input<'xxs' | 'xs' | 'sm'>('sm');

  protected readonly cols = computed(
    () => `repeat(${this.tabs().length || 1}, minmax(0, 1fr))`,
  );

  protected readonly hostTextClass = computed(() => {
    const s = this.size();
    return s === 'xxs' ? 'text-[10px]' : s === 'xs' ? 'text-xs' : 'text-sm';
  });

  protected btnClass(value: string): string {
    const pad = this.size() === 'xxs' ? 'px-2 py-0.5' : 'px-3 py-1.5';
    const base = `min-w-0 truncate rounded-lg ${pad} transition`;
    // `ink-100` rather than a translucent white: the track is `surface` (#F5F5F5) and
    // `ink-50` (#F4F4F4) is the same colour to the eye, so a lighter dull chip would be
    // invisible on it. This one is a step darker, which is what makes it read as a chip.
    return value === this.active()
      ? `${base} bg-white text-ink-900 shadow-card`
      : `${base} bg-ink-100 text-ink-500 hover:bg-ink-200 hover:text-ink-800`;
  }
}
