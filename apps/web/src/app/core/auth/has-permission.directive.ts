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
 * Structural directive that renders its content only when the session holds the given
 * flag(s). Reactive — shows/hides as the session changes.
 *
 * `<button *hhHasPermission="'host:Room:create'" hh-button>Add room</button>`
 *
 * An array requires **all** of them, for an action that spans two subjects. Removing a
 * manager, say, calls the hostel's `remove_manager` endpoint but is also a destructive
 * change to a staff record, so it takes both:
 *
 * `*hhHasPermission="['host:Hostel:remove_manager', 'host:Staff:destroy']"`
 *
 * All-of rather than any-of is deliberate: these gates guard destructive actions, where the
 * safe reading of two requirements is that both must hold.
 */
@Directive({ selector: '[hhHasPermission]' })
export class HasPermission {
  private readonly tpl = inject(TemplateRef<unknown>);
  private readonly vcr = inject(ViewContainerRef);
  private readonly session = inject(SessionStore);

  readonly hhHasPermission = input.required<Permission | Permission[]>();

  constructor() {
    effect(() => {
      const required = this.hhHasPermission();
      const flags = Array.isArray(required) ? required : [required];
      const allowed = flags.every((f) => this.session.hasPermission(f));
      this.vcr.clear();
      if (allowed) this.vcr.createEmbeddedView(this.tpl);
    });
  }
}
