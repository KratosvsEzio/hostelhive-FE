import { Directive, ElementRef, inject, input, OnDestroy } from '@angular/core';

/**
 * Hover tooltip driven by the `.tip` CSS in libs/styles/global.css.
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
  },
})
export class TooltipFixed implements OnDestroy {
  readonly hhTooltip = input('');

  private readonly el = inject(ElementRef<HTMLElement>);
  private popup: HTMLDivElement | null = null;

  show(): void {
    const text = this.hhTooltip();
    if (!text) return;

    const rect = this.el.nativeElement.getBoundingClientRect();
    const div = document.createElement('div');
    div.textContent = text;

    Object.assign(div.style, {
      position:     'fixed',
      zIndex:       '9999',
      left:         `${rect.left + rect.width / 2}px`,
      top:          `${rect.top - 8}px`,
      transform:    'translateX(-50%) translateY(-100%)',
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
