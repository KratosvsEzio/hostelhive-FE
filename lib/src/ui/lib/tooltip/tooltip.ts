import { Directive, ElementRef, inject, input, OnDestroy } from '@angular/core';

/**
 * Hover tooltip driven by the `.tip` CSS in apps/web/src/global.css.
 * `<i class="ti ti-wifi" hhTip="Wi-Fi"></i>`
 */
@Directive({
  selector: '[hhTip]',
  host: {
    class: 'tip',
    '[attr.data-tip]': 'hhTip()',
  },
})
export class Tooltip {
  readonly hhTip = input('');
}

/**
 * Fixed-position tooltip that escapes `overflow: auto/hidden` containers.
 * Appends a <div> to <body> on mouseenter and removes it on mouseleave.
 * Use instead of `hhTip` whenever the host element is inside a scrollable panel.
 *
 * `<span [hhTooltip]="longText">…</span>`
 */
@Directive({
  selector: '[hhTooltip]',
  host: {
    '(mouseenter)': 'show()',
    '(mouseleave)': 'hide()',
    // Focus as well as hover, so the tooltip is reachable by keyboard. It is often the only
    // place an abbreviation is expanded, and hover cannot be the sole route to a meaning.
    '(focus)': 'show()',
    '(blur)': 'hide()',
  },
})
export class TooltipFixed implements OnDestroy {
  readonly hhTooltip = input('');

  /**
   * Which side the bubble sits on.
   *
   * Above suits a label under an icon in a row. Beside suits a vertical rail, where "above"
   * lands on the previous item and reads as belonging to that one instead.
   */
  readonly hhTooltipPlacement = input<'top' | 'right'>('top');


  private readonly el = inject(ElementRef<HTMLElement>);
  private popup: HTMLDivElement | null = null;

  show(): void {
    const text = this.hhTooltip();
    if (!text) return;

    const rect = this.el.nativeElement.getBoundingClientRect();
    const div = document.createElement('div');
    div.textContent = text;

    const place =
      this.hhTooltipPlacement() === 'right'
        ? {
            left: `${rect.right + 8}px`,
            top: `${rect.top + rect.height / 2}px`,
            transform: 'translateY(-50%)',
          }
        : {
            left: `${rect.left + rect.width / 2}px`,
            top: `${rect.top - 8}px`,
            transform: 'translateX(-50%) translateY(-100%)',
          };

    Object.assign(div.style, {
      position:     'fixed',
      zIndex:       '9999',
      ...place,
      background:   '#1f1f1f',
      color:        '#fff',
      fontSize:     '11px',
      fontWeight:   '500',
      fontFamily:   'Inter, system-ui, sans-serif',
      lineHeight:   '1.4',
      padding:      '5px 8px',
      borderRadius: '6px',
      maxWidth:     '220px',
      whiteSpace:   'normal',
      wordBreak:    'break-word',
      pointerEvents:'none',
      boxShadow:    '0 4px 16px rgba(31,31,31,0.18)',
    });

    document.body.appendChild(div);
    this.popup = div;
  }

  hide(): void {
    this.popup?.remove();
    this.popup = null;
  }

  ngOnDestroy(): void {
    this.popup?.remove();
  }
}
