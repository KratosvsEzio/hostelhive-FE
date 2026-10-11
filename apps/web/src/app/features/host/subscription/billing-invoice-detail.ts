import { NgTemplateOutlet } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
  inject,
  signal,
} from '@angular/core';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Params, Router, RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import {
  Observable,
  type Subscription,
  combineLatest,
  distinctUntilChanged,
  filter,
  map,
  skip,
} from 'rxjs';
import type { ApiError, BillingInvoice } from '@hostelhive/data-access';
import {
  Button,
  Card,
  ErrorState,
  HhLink,
  Skeleton,
  StatusPill,
} from '@hostelhive/ui';
import { BillingApi } from '@services';
import { SessionStore } from '@core/auth/session-store';
import { LocaleLink } from '@core/i18n/locale-link';
import { LocaleStore } from '@core/i18n/locale-store';
import { localiseCommands } from '@core/i18n/locale-commands';
import { DashboardLayout } from '@layout/dashboard-layout/dashboard-layout';
import { ApiDate } from '@util/api-date';
import { isNetworkError } from '@util/network-error';
import {
  AttemptNotice,
  billingHistoryPath,
  billingInvoiceCharged,
  billingInvoiceStatusKey,
  invoiceStatusTone,
  latestAttemptNotice,
} from '@app/shared/billing/billing-labels';
import {
  BILLING_HISTORY_STATE_KEY,
  type BillingHistoryQuery,
} from './billing-invoice-table';
import { InvoiceSummary } from './invoice-summary';
import { PollTick, pollInvoice } from './invoice-poll';
import { PaymentAttempts } from './payment-attempts';

type LoadView =
  | { kind: 'loading' }
  | { kind: 'ready' }
  | { kind: 'forbidden' }
  | { kind: 'notFound' }
  | { kind: 'error'; networkError: boolean };

/** Where a paid invoice's receipt stands while its URL is still missing. */
type ReceiptWait = 'idle' | 'polling' | 'slow';

const NOTICE_CLASSES: Record<AttemptNotice['tone'], string> = {
  danger: 'bg-danger/10 font-medium text-danger',
  warn: 'bg-warn/10 text-ink-800',
  neutral: 'bg-ink-50 text-ink-700',
};

function awaitsReceipt(invoice: BillingInvoice | null): boolean {
  return invoice?.status?.slug === 'paid' && !invoice.invoice_pdf_url;
}

function endsPoll(tick: PollTick): boolean {
  if ('invoice' in tick) return !awaitsReceipt(tick.invoice);
  return tick.error?.status === 403 || tick.error?.status === 404;
}

/**
 * Only the history page's own filter and page survive the trip back to it. The state is
 * checked field by field, since browser history can hand back anything.
 */
function historyParams(state: unknown): Params | null {
  if (!state || typeof state !== 'object') return null;
  const { status, page } = state as {
    [K in keyof BillingHistoryQuery]?: unknown;
  };
  const params: Params = {};
  if (typeof status === 'string' && status) params['status'] = status;
  if (typeof page === 'number' && page > 1) params['page'] = page;
  return Object.keys(params).length ? params : null;
}

/**
 * One HostelHive invoice in a hostel's billing history: what it was for, every attempt to pay
 * it, and the one thing the host can do next — pay it, download its receipt, or nothing.
 *
 * The invoice is always the detail payload, read again whenever the id in the URL changes. A
 * paid invoice whose receipt is still being generated is refetched until the receipt appears
 * or the wait runs out. Switching hostel leaves for the new hostel's history, since the
 * invoice cannot say which hostel it belongs to.
 */
@Component({
  selector: 'hh-billing-invoice-detail',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    DashboardLayout,
    InvoiceSummary,
    PaymentAttempts,
    Button,
    Card,
    ErrorState,
    HhLink,
    Skeleton,
    StatusPill,
    RouterLink,
    LocaleLink,
    NgTemplateOutlet,
    TranslocoPipe,
    ApiDate,
  ],
  templateUrl: './billing-invoice-detail.html',
})
export class BillingInvoiceDetail {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly api = inject(BillingApi);
  private readonly session = inject(SessionStore);
  private readonly locale = inject(LocaleStore);
  private readonly destroyRef = inject(DestroyRef);

  // The hostel id sits on an ancestor route and is not inherited here, so every level is read.
  private readonly hostelId$: Observable<string> = combineLatest(
    this.route.pathFromRoot.map((r) => r.paramMap),
  ).pipe(
    map(
      (maps) =>
        maps
          .map((m) => m.get('hostelId'))
          .filter((id): id is string => !!id)
          .at(-1) ?? '',
    ),
    distinctUntilChanged(),
  );

  private readonly invoiceId$ = this.route.paramMap.pipe(
    map((m) => m.get('invoiceId') ?? ''),
    distinctUntilChanged(),
  );

  protected readonly hostelId = toSignal(this.hostelId$, { initialValue: '' });
  private readonly invoiceId = signal('');

  private loading: Subscription | null = null;
  private polling: Subscription | null = null;

  protected readonly invoice = signal<BillingInvoice | null>(null);
  protected readonly view = signal<LoadView>({ kind: 'loading' });
  protected readonly receiptWait = signal<ReceiptWait>('idle');

  protected readonly canPay = computed(() =>
    this.session.hasPermission('core:Invoice:create_payment'),
  );

  protected readonly slug = computed(() => this.invoice()?.status?.slug ?? '');

  protected readonly tone = computed(() => invoiceStatusTone(this.slug()));

  /** Our label for a known status, or null so the template shows the server's name. */
  protected readonly statusKey = computed(() =>
    billingInvoiceStatusKey(this.slug()),
  );

  protected readonly charged = computed(() => {
    const invoice = this.invoice();
    return !!invoice && billingInvoiceCharged(invoice);
  });

  // The charged notice already sits under the header, so the one above Pay never repeats it.
  protected readonly notice = computed(() => {
    const invoice = this.invoice();
    const notice = invoice ? latestAttemptNotice(invoice) : null;
    return notice?.key === 'hostPayment.chargedNotApplied' && this.charged()
      ? null
      : notice;
  });

  protected readonly noticeClass = computed(
    () => NOTICE_CLASSES[this.notice()?.tone ?? 'neutral'],
  );

  protected readonly payLink = computed(() => {
    const invoice = this.invoice();
    return invoice
      ? `/host/${this.hostelId()}/subscription/pay/${invoice.id}`
      : '';
  });

  protected readonly historyLink = computed(() =>
    billingHistoryPath(this.hostelId()),
  );

  // Handed over by the history page's link, so the way back keeps its filter and page.
  protected readonly historyQuery = computed(() =>
    historyParams(
      this.router.lastSuccessfulNavigation()?.extras.state?.[
        BILLING_HISTORY_STATE_KEY
      ],
    ),
  );

  protected readonly networkError = computed(() => {
    const v = this.view();
    return v.kind === 'error' && v.networkError;
  });

  constructor() {
    this.invoiceId$
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((id) => {
        this.invoiceId.set(id);
        this.invoice.set(null);
        this.load();
      });

    this.hostelId$
      .pipe(
        skip(1),
        filter((id) => !!id),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe((id) => this.leaveForHistory(id));
  }

  protected load(): void {
    this.stopPolling();
    this.loading?.unsubscribe();
    const id = this.invoiceId();
    if (this.view().kind !== 'ready' || !this.invoice()) {
      this.view.set({ kind: 'loading' });
    }
    this.loading = this.api
      .invoice(id)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (invoice) => {
          this.invoice.set(invoice);
          this.view.set({ kind: 'ready' });
          if (awaitsReceipt(invoice)) this.pollReceipt();
        },
        error: (err: ApiError) => this.loadFailed(err),
      });
  }

  /** Another round of waiting for the receipt, after the last one ran out. */
  protected checkAgain(): void {
    if (this.receiptWait() === 'polling') return;
    this.pollReceipt();
  }

  private pollReceipt(): void {
    this.stopPolling();
    const id = this.invoiceId();
    this.receiptWait.set('polling');
    this.polling = pollInvoice(() => this.api.invoice(id), { until: endsPoll })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (tick) => {
          // A transient failure keeps polling; only a refusal or a missing invoice ends it.
          if ('invoice' in tick) this.invoice.set(tick.invoice);
          else if (endsPoll(tick)) this.loadFailed(tick.error);
        },
        complete: () => {
          this.polling = null;
          const stillWaiting =
            this.view().kind === 'ready' && awaitsReceipt(this.invoice());
          this.receiptWait.set(stillWaiting ? 'slow' : 'idle');
        },
      });
  }

  private stopPolling(): void {
    this.polling?.unsubscribe();
    this.polling = null;
    this.receiptWait.set('idle');
  }

  private loadFailed(err: ApiError): void {
    if (err?.status === 403) {
      this.invoice.set(null);
      this.view.set({ kind: 'forbidden' });
      return;
    }
    if (err?.status === 404) {
      this.invoice.set(null);
      this.view.set({ kind: 'notFound' });
      return;
    }
    // An invoice already on screen stays there; only an empty page shows the failure.
    if (this.invoice()) return;
    this.view.set({ kind: 'error', networkError: isNetworkError(err) });
  }

  private leaveForHistory(hostelId: string): void {
    this.stopPolling();
    const url = localiseCommands(
      billingHistoryPath(hostelId),
      this.locale.active(),
    ) as string;
    void this.router.navigateByUrl(url, { replaceUrl: true });
  }
}
