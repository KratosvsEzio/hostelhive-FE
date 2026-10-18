import { DOCUMENT, isPlatformBrowser } from '@angular/common';
import { Injectable, PLATFORM_ID, inject } from '@angular/core';
import type { ParamMap } from '@angular/router';
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
import type { ApiError, SavedCard } from '@hostelhive/data-access';
import { BillingApi, HostPropertyStore } from '@services';
import { ExternalNavigation } from '@core/browser/external-navigation';

/** sessionStorage key for what a payer left for Safepay to do, and the hostel they left from. */
export const SAFEPAY_RETURN_KEY = 'hh.billing.return';

const SAFEPAY_HOST = 'getsafepay.com';

/** The query params Safepay sends a payer back with: an invoice id, or a card or subscription outcome. */
export type ReturnParamName = 'invoice' | 'card' | 'subscription';

/**
 * Safepay appends `?tracker=…` to our return URLs even though they already carry a query, so
 * the page arrives as `?invoice=CQcLFP?tracker=track_…` and the whole tail reads as part of the
 * value. Our values never contain `?`, so everything from the first one is Safepay's and is dropped.
 */
function stripTracker(value: string | null): string | null {
  return value?.split('?', 1)[0].trim() || null;
}

/** A return page's `name` query param without Safepay's tracker suffix, or null when there is none. */
export function returnParam(
  params: Pick<ParamMap, 'get'>,
  name: ReturnParamName,
): string | null {
  return stripTracker(params.get(name));
}

/** The invoice id from a return page's `?invoice=` value, or null when there is none. */
export function returnInvoiceId(param: string | null): string | null {
  return stripTracker(param);
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

/** What the payer left for Safepay to do, kept for the page Safepay sends them back to. */
export type ReturnStash =
  | { kind: 'invoice'; invoiceId: string; hostelId: string | null }
  | {
      kind: 'card';
      hostelId: string;
      /** The card saved before leaving, so the return page can tell when the new one lands. */
      previous: SavedCard | null;
      /** The invoice the card is being saved for, when the payer came from one. */
      invoiceId?: string;
    }
  | { kind: 'subscription'; hostelId: string; planId: string };

export type ReturnKind = ReturnStash['kind'];

/** The error the starts fail with when the server hands back no usable Safepay page. */
function badCheckoutUrl(): ApiError {
  return { status: -1, code: 'bad_checkout_url', message: '' };
}

function readSavedCard(value: unknown): SavedCard | null {
  if (typeof value !== 'object' || value === null) return null;
  const { label, expires_on } = value as Record<string, unknown>;
  if (typeof label !== 'string') return null;
  return {
    label,
    expires_on: typeof expires_on === 'string' ? expires_on : null,
  };
}

/** A stash as read back from storage, or null when it is not one this app wrote. */
function parseStash(value: unknown): ReturnStash | null {
  if (typeof value !== 'object' || value === null) return null;
  const { kind, invoiceId, hostelId, previous, planId } = value as Record<
    string,
    unknown
  >;
  switch (kind) {
    // A stash written before kinds existed is an invoice's.
    case undefined:
    case 'invoice':
      if (typeof invoiceId !== 'string') return null;
      return {
        kind: 'invoice',
        invoiceId,
        hostelId: typeof hostelId === 'string' ? hostelId : null,
      };
    case 'card':
      if (typeof hostelId !== 'string') return null;
      return {
        kind: 'card',
        hostelId,
        previous: readSavedCard(previous),
        ...(typeof invoiceId === 'string' ? { invoiceId } : {}),
      };
    case 'subscription':
      if (typeof hostelId !== 'string' || typeof planId !== 'string') {
        return null;
      }
      return { kind: 'subscription', hostelId, planId };
    default:
      return null;
  }
}

/**
 * Sends a payer to Safepay and helps them find their way back.
 *
 * Before leaving, what they left to do and the hostel they left from are stashed for this tab
 * only, because an invoice does not say which hostel it belongs to and the return pages need to
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
   * Starts the payment and, once Safepay's page is known, leaves for it. With `saveCard`,
   * Safepay also keeps the card for automatic renewal.
   *
   * Emits once and completes after the navigation has been asked for; the page is unloading
   * by then, so the caller keeps its loading state. Fails with the request's `ApiError`, or
   * with status -1 and code `bad_checkout_url` when there is no Safepay page to go to.
   */
  start(
    invoiceId: string,
    hostelId: string | null,
    opts: { saveCard?: boolean } = {},
  ): Observable<void> {
    return this.leave(this.api.pay(invoiceId, opts), {
      kind: 'invoice',
      invoiceId,
      hostelId,
    });
  }

  /**
   * Leaves for Safepay to save or replace the hostel's card, as {@link start} does. `previous` is
   * the card on file now, and `invoiceId` the invoice the payer came from, if any.
   */
  startCardSave(
    hostelId: string,
    previous: SavedCard | null,
    invoiceId?: string,
  ): Observable<void> {
    return this.leave(this.api.saveCard(hostelId), {
      kind: 'card',
      hostelId,
      previous,
      ...(invoiceId ? { invoiceId } : {}),
    });
  }

  /** Leaves for Safepay to subscribe the hostel to `planId`, as {@link start} does. */
  startSubscribe(hostelId: string, planId: string): Observable<void> {
    return this.leave(this.api.subscribeWithSafepay(hostelId, planId), {
      kind: 'subscription',
      hostelId,
      planId,
    });
  }

  /** What the payer left for Safepay to do, or null when this tab stashed nothing readable. */
  returnStash(): ReturnStash | null {
    return this.readReturn();
  }

  /**
   * The hostel whose billing the payer should go back to: the one they left from for this
   * invoice, else the hostel selected in the console, else null.
   */
  returnHostel(invoiceId: string | null): string | null {
    const stash = this.readReturn();
    if (
      invoiceId &&
      stash?.kind === 'invoice' &&
      stash.invoiceId === invoiceId &&
      stash.hostelId
    ) {
      return stash.hostelId;
    }
    return this.selectedHostel();
  }

  /**
   * The hostel a card or subscription return belongs to: the one stashed for a start of that
   * `kind`, else the hostel selected in the console, else null.
   */
  returnHostelFor(kind: ReturnKind): string | null {
    const stash = this.readReturn();
    if (stash?.kind === kind && stash.hostelId) return stash.hostelId;
    return this.selectedHostel();
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

  /** Waits for the start request, then stashes and leaves for its Safepay page. */
  private leave(
    request: Observable<{ checkout_url: string | null }>,
    stash: ReturnStash,
  ): Observable<void> {
    return request.pipe(
      switchMap(({ checkout_url }) => {
        if (!isSafepayCheckoutUrl(checkout_url)) {
          return throwError(badCheckoutUrl);
        }
        this.writeReturn(stash);
        this.navigation.assign(checkout_url);
        return of(undefined);
      }),
    );
  }

  private selectedHostel(): string | null {
    return this.properties.selected() || null;
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
      return parseStash(JSON.parse(raw));
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
  /** The saved card was declined: show the bank's reason and offer another card. */
  | { kind: 'declined'; message: string }
  /** A saved-card charge for this invoice is still being processed: show the message, pay later. */
  | { kind: 'inProgress'; message: string }
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
  if (/^Your card was declined/.test(message)) {
    return { kind: 'declined', message };
  }
  if (/already in progress/.test(message)) {
    return { kind: 'inProgress', message };
  }
  if (
    /^There is nothing to pay/.test(message) ||
    /(isn|aren)['’]t available for/.test(message)
  ) {
    return { kind: 'unpayable', message };
  }
  return { kind: 'retry', message };
}
