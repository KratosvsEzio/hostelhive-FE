import { DOCUMENT, isPlatformBrowser } from '@angular/common';
import { Injectable, PLATFORM_ID, inject } from '@angular/core';
import {
  EMPTY,
  Observable,
  filter,
  fromEvent,
  map,
  of,
  switchMap,
  throwError,
} from 'rxjs';
import type { ApiError } from '@hostelhive/data-access';
import { BillingApi, HostPropertyStore } from '@services';
import { ExternalNavigation } from '@core/browser/external-navigation';

/** sessionStorage key for the invoice and hostel a payer left for Safepay from. */
export const SAFEPAY_RETURN_KEY = 'hh.billing.return';

const SAFEPAY_HOST = 'getsafepay.com';

/**
 * The invoice id from a return page's `?invoice=` value, or null when there is none.
 *
 * Safepay appends `?tracker=…` to our return URLs even though they already carry a query, so
 * the page arrives as `?invoice=CQcLFP?tracker=track_…` and the whole tail reads as part of the
 * id. Ids never contain `?`, so everything from the first one is Safepay's and is dropped.
 */
export function returnInvoiceId(param: string | null): string | null {
  return param?.split('?', 1)[0].trim() || null;
}

/**
 * True only for an https page on Safepay's own domain or one of its sub-domains.
 * Anything else in a checkout response is refused rather than navigated to.
 */
export function isSafepayCheckoutUrl(
  url: string | null | undefined,
): url is string {
  if (!url) return false;
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return false;
  }
  const host = parsed.hostname;
  return (
    parsed.protocol === 'https:' &&
    (host === SAFEPAY_HOST || host.endsWith(`.${SAFEPAY_HOST}`))
  );
}

interface ReturnStash {
  invoiceId: string;
  hostelId: string | null;
}

/** The error `start()` fails with when the server hands back no usable checkout page. */
function badCheckoutUrl(): ApiError {
  return { status: -1, code: 'bad_checkout_url', message: '' };
}

/**
 * Sends a payer to Safepay and helps them find their way back.
 *
 * Before leaving, the invoice and the hostel it was paid from are stashed for this tab only,
 * because the invoice does not say which hostel it belongs to and the return pages need to
 * offer a way back into that hostel's billing.
 */
@Injectable({ providedIn: 'root' })
export class SafepayCheckout {
  private readonly api = inject(BillingApi);
  private readonly navigation = inject(ExternalNavigation);
  private readonly properties = inject(HostPropertyStore);
  private readonly window = isPlatformBrowser(inject(PLATFORM_ID))
    ? inject(DOCUMENT).defaultView
    : null;

  /** Emits when the browser restores this page from its back-forward cache. */
  readonly restored$: Observable<void> = this.window
    ? fromEvent<PageTransitionEvent>(this.window, 'pageshow').pipe(
        filter((event) => event.persisted),
        map((): void => undefined),
      )
    : EMPTY;

  /**
   * Starts the payment and, once Safepay's page is known, leaves for it.
   *
   * Emits once and completes after the navigation has been asked for; the page is unloading
   * by then, so the caller keeps its loading state. Fails with the request's `ApiError`, or
   * with status -1 and code `bad_checkout_url` when there is no Safepay page to go to.
   */
  start(invoiceId: string, hostelId: string | null): Observable<void> {
    return this.api.pay(invoiceId).pipe(
      switchMap(({ checkout_url }) => {
        if (!isSafepayCheckoutUrl(checkout_url)) {
          return throwError(badCheckoutUrl);
        }
        this.writeReturn({ invoiceId, hostelId });
        this.navigation.assign(checkout_url);
        return of(undefined);
      }),
    );
  }

  /**
   * The hostel whose billing the payer should go back to: the one they left from for this
   * invoice, else the hostel selected in the console, else null.
   */
  returnHostel(invoiceId: string | null): string | null {
    const stash = this.readReturn();
    if (invoiceId && stash?.invoiceId === invoiceId && stash.hostelId) {
      return stash.hostelId;
    }
    return this.properties.selected() || null;
  }

  /** Router commands for the billing screen to go back to, before localisation. */
  billingCommands(invoiceId: string | null): string[] {
    const hostelId = this.returnHostel(invoiceId);
    return hostelId ? ['/host', hostelId, 'subscription'] : ['/host'];
  }

  /** Forgets the stash, once the invoice is settled and there is nothing left to return to. */
  clearReturn(): void {
    try {
      this.window?.sessionStorage.removeItem(SAFEPAY_RETURN_KEY);
    } catch {
      // Storage refused (privacy mode): there is nothing to forget.
    }
  }

  private writeReturn(stash: ReturnStash): void {
    try {
      this.window?.sessionStorage.setItem(
        SAFEPAY_RETURN_KEY,
        JSON.stringify(stash),
      );
    } catch {
      // Storage refused: the return pages fall back to the selected hostel.
    }
  }

  private readReturn(): ReturnStash | null {
    try {
      const raw = this.window?.sessionStorage.getItem(SAFEPAY_RETURN_KEY);
      if (!raw) return null;
      const parsed: unknown = JSON.parse(raw);
      if (typeof parsed !== 'object' || parsed === null) return null;
      const { invoiceId, hostelId } = parsed as Record<string, unknown>;
      if (typeof invoiceId !== 'string') return null;
      return {
        invoiceId,
        hostelId: typeof hostelId === 'string' ? hostelId : null,
      };
    } catch {
      return null;
    }
  }
}

/** What a page does when starting a payment fails. Messages are the server's, shown verbatim. */
export type PayErrorOutcome =
  /** The invoice expired and was voided: offer a new plan choice, without refetching. */
  | { kind: 'expired'; message: string }
  /** The invoice was paid or voided meanwhile: show the message and refetch. */
  | { kind: 'settled'; message: string }
  /** This invoice cannot be paid online: show the message and hide Pay. */
  | { kind: 'unpayable'; message: string }
  /** Any other refusal: show the message and let the payer try again. */
  | { kind: 'retry'; message: string }
  | { kind: 'forbidden' }
  | { kind: 'notFound' }
  /** No usable answer (network, server error, bad checkout page): generic copy, try again. */
  | { kind: 'failed' };

/** Maps a failed `start()` to what the page should do about it. */
export function payErrorOutcome(err: unknown): PayErrorOutcome {
  const { status, serverMessages } = (
    typeof err === 'object' && err !== null ? err : {}
  ) as Partial<ApiError>;

  if (status === 403) return { kind: 'forbidden' };
  if (status === 404) return { kind: 'notFound' };
  if (status !== 422) return { kind: 'failed' };

  const message = serverMessages?.[0];
  // A refusal with nothing to show would leave the payer with no explanation at all.
  if (!message) return { kind: 'failed' };

  if (/^This invoice has expired/.test(message)) {
    return { kind: 'expired', message };
  }
  if (/^Invoice .+ is (paid|void)/.test(message)) {
    return { kind: 'settled', message };
  }
  if (
    /^There is nothing to pay/.test(message) ||
    /isn['’]t available for/.test(message)
  ) {
    return { kind: 'unpayable', message };
  }
  return { kind: 'retry', message };
}
