import { DOCUMENT } from '@angular/common';
import { Injectable, inject } from '@angular/core';

/**
 * Full-page navigation away from the app, for destinations the router cannot reach.
 *
 * A seam over `location.assign`, which no test environment lets a spec replace, so a spec
 * provides its own and asserts the URL. On the server there is no window and it does nothing.
 */
@Injectable({ providedIn: 'root' })
export class ExternalNavigation {
  private readonly document = inject(DOCUMENT);

  assign(url: string): void {
    this.document.defaultView?.location.assign(url);
  }
}
