import {
  Directive,
  TemplateRef,
  ViewContainerRef,
  effect,
  inject,
  input,
} from '@angular/core';
import { Permission } from './roles';
import { SessionStore } from './session-store';

/**
 * Structural directive that renders its content only when the session holds the
 * given flag. `<button *hhHasPermission="'payments.refund'" hh-button>Refund</button>`
 * Reactive — shows/hides as the session changes.
 */
@Directive({ selector: '[hhHasPermission]' })
export class HasPermission {
  private readonly tpl = inject(TemplateRef<unknown>);
  private readonly vcr = inject(ViewContainerRef);
  private readonly session = inject(SessionStore);

  readonly hhHasPermission = input.required<Permission>();

  constructor() {
    effect(() => {
      const allowed = this.session.hasPermission(this.hhHasPermission());
      this.vcr.clear();
      if (allowed) this.vcr.createEmbeddedView(this.tpl);
    });
  }
}
