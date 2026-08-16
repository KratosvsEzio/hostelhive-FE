import {
  ChangeDetectionStrategy,
  Component,
  PLATFORM_ID,
  inject,
  signal,
} from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { Button, Input } from '@hostelhive/ui';
import { apiEnv } from '@app/api.env';
import {
  clearDevApiBaseUrl,
  devSetupPending,
  hasDevApiBaseUrl,
  readDevApiBaseUrl,
  setDevApiBaseUrl,
} from '@core/dev-api-base-url';

/**
 * TEMPORARY testing gate. On startup, if no BE base URL has been set, this blocks the app
 * with an overlay asking the tester to enter one; it's stored (see `@core/dev-api-base-url`)
 * and the app reloads so every API call targets that backend. Remove before go-live.
 *
 * `ngSkipHydration` because the overlay only exists in the browser — the server renders
 * nothing, so skipping hydration avoids a mismatch on the fixed overlay subtree.
 */
@Component({
  selector: 'hh-dev-setup-gate',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [Button, Input],
  host: { ngSkipHydration: 'true' },
  templateUrl: './dev-setup-gate.html',
})
export class DevSetupGate {
  private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));

  /**
   * Shown on every browser boot — first visit and each reload — so a tester whose backend
   * moved (the dev API's LAN IP changes between sessions) is always given the chance to
   * repoint the app before it fires a single request at a dead host. Shared with `app.html`,
   * which holds the shell back until this clears.
   */
  protected readonly open = devSetupPending;
  /** Prefilled with the stored value, so confirming an unchanged backend is one click. */
  protected readonly url = signal(readDevApiBaseUrl() ?? apiEnv.apiUrl);
  protected readonly error = signal('');
  /** True once a URL has been stored — drives the "already set" copy and the Reset button. */
  protected readonly hasStored = this.isBrowser && hasDevApiBaseUrl();

  protected onUrl(value: string): void {
    this.url.set(value);
    this.error.set('');
  }

  protected save(): void {
    const value = this.url().trim().replace(/\/+$/, '');
    if (!/^https?:\/\/.+/i.test(value)) {
      this.error.set('Enter a full URL starting with http:// or https://');
      return;
    }
    // Unchanged: bootstrap already handed this base URL to every API reader, so release the
    // shell in place. Reloading here would re-open the gate and trap the tester in it.
    if (value === readDevApiBaseUrl()) {
      devSetupPending.set(false);
      return;
    }
    setDevApiBaseUrl(value);
    // Changed: readers cache `API_CONFIG.baseUrl` at construction, so only a full reload
    // repoints them all.
    location.reload();
  }

  /** Wipe the stored URL and reload back to this gate — handy while testing. */
  protected reset(): void {
    clearDevApiBaseUrl();
    location.reload();
  }
}
