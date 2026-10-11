import { DOCUMENT, NgTemplateOutlet } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
  inject,
  signal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import type { Subscription } from 'rxjs';
import type { ApiError, BillingInvoice } from '@hostelhive/data-access';
import {
  Button,
  ErrorState,
  HhLink,
  Skeleton,
  StatusPill,
} from '@hostelhive/ui';
import { BillingApi } from '@services';
import { SessionStore } from '@core/auth/session-store';
import { LocaleLink } from '@core/i18n/locale-link';
import { DashboardLayout } from '@layout/dashboard-layout/dashboard-layout';
import { ApiDate } from '@util/api-date';
import { isNetworkError } from '@util/network-error';
import {
  AttemptNotice,
  invoiceStatusTone,
  latestAttemptNotice,
} from '@app/shared/billing/billing-labels';
import { BillingMoneyPipe } from '@app/shared/billing/billing-money.pipe';
import { InvoiceSummary } from './invoice-summary';
import {
  PayErrorOutcome,
  SafepayCheckout,
  payErrorOutcome,
} from './safepay-checkout';

type LoadView =
  | { kind: 'loading' }
  | { kind: 'ready' }
  | { kind: 'forbidden' }
  | { kind: 'notFound' }
  | { kind: 'error'; networkError: boolean };

/** Outcomes after which this page offers no Pay button for the invoice on screen. */
const PAY_BLOCKING: readonly PayErrorOutcome['kind'][] = [
  'expired',
  'unpayable',
  'forbidden',
];

const NOTICE_CLASSES: Record<AttemptNotice['tone'], string> = {
  danger: 'bg-danger/10 font-medium text-danger',
  warn: 'bg-warn/10 text-ink-800',
  neutral: 'bg-ink-50 text-ink-700',
};

/**
 * The payment step for one HostelHive invoice: what is being paid for, and one button that
 * hands the payer to Safepay.
 *
 * The invoice is always read from the server; one handed over in the router's navigation state
 * only fills the page while that request is in flight. Paid, void and unknown invoices are
 * shown without a Pay button, and a refused start is explained with the server's own words
 * (never for a 403) or with ours.
 */
@Component({
  selector: 'hh-payment-step',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    DashboardLayout,
    InvoiceSummary,
    Button,
    ErrorState,
    HhLink,
    Skeleton,
    StatusPill,
    RouterLink,
    NgTemplateOutlet,
    LocaleLink,
    TranslocoPipe,
    BillingMoneyPipe,
    ApiDate,
  ],
  templateUrl: './payment-step.html',
})
export class PaymentStep {
  private readonly route = inject(ActivatedRoute);
  private readonly api = inject(BillingApi);
  private readonly checkout = inject(SafepayCheckout);
  private readonly session = inject(SessionStore);
  private readonly destroyRef = inject(DestroyRef);
  private readonly doc = inject(DOCUMENT);

  private readonly invoiceId =
    this.route.snapshot.paramMap.get('invoiceId') ?? '';

  // The hostel id sits on an ancestor route, so it is found by walking up from here.
  private readonly hostelId =
    this.route.pathFromRoot
      .map((r) => r.snapshot.paramMap.get('hostelId'))
      .filter((id): id is string => !!id)
      .at(-1) ?? null;

  private loading: Subscription | null = null;

  protected readonly invoice = signal<BillingInvoice | null>(this.handedOver());
  protected readonly view = signal<LoadView>({ kind: 'loading' });
  protected readonly starting = signal(false);
  protected readonly outcome = signal<PayErrorOutcome | null>(null);

  protected readonly billingLink = this.hostelId
    ? `/host/${this.hostelId}/subscription`
    : '/host';

  protected readonly canPay = computed(() =>
    this.session.hasPermission('core:Invoice:create_payment'),
  );

  protected readonly slug = computed(() => this.invoice()?.status?.slug ?? '');

  protected readonly tone = computed(() => invoiceStatusTone(this.slug()));

  protected readonly notice = computed(() => {
    const invoice = this.invoice();
    return invoice ? latestAttemptNotice(invoice) : null;
  });

  protected readonly noticeClass = computed(
    () => NOTICE_CLASSES[this.notice()?.tone ?? 'neutral'],
  );

  protected readonly networkError = computed(() => {
    const v = this.view();
    return v.kind === 'error' && v.networkError;
  });

  /** The server's own words for a refused start, when it gave any worth showing. */
  protected readonly outcomeMessage = computed(() => {
    const o = this.outcome();
    return o && 'message' in o ? o.message : null;
  });

  protected readonly expired = computed(
    () => this.outcome()?.kind === 'expired',
  );

  protected readonly showPay = computed(() => {
    const kind = this.outcome()?.kind;
    return (
      this.slug() === 'open' &&
      this.canPay() &&
      !(kind && PAY_BLOCKING.includes(kind))
    );
  });

  protected readonly payForbidden = computed(
    () => !this.canPay() || this.outcome()?.kind === 'forbidden',
  );

  constructor() {
    this.load();
    // A page restored from the back-forward cache still shows the spinner it left with.
    this.checkout.restored$
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => {
        this.starting.set(false);
        // An expired invoice is never refetched: the server may still report it open.
        if (!this.expired()) this.load();
      });
  }

  /** Unicode isolates around an interpolated amount, the plain-text form of `<bdi>`. */
  protected isolate(text: string): string {
    return `⁨${text}⁩`;
  }

  protected load(): void {
    this.loading?.unsubscribe();
    if (this.view().kind !== 'ready') this.view.set({ kind: 'loading' });
    this.loading = this.api
      .invoice(this.invoiceId)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (invoice) => {
          this.invoice.set(invoice);
          this.view.set({ kind: 'ready' });
        },
        error: (err: ApiError) => this.loadFailed(err),
      });
  }

  protected pay(): void {
    if (this.starting() || !this.showPay()) return;
    this.starting.set(true);
    this.outcome.set(null);
    this.checkout
      .start(this.invoiceId, this.hostelId)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        // The browser is leaving for Safepay, so the button keeps its spinner until it does.
        error: (err: unknown) => this.startFailed(payErrorOutcome(err)),
      });
  }

  private startFailed(outcome: PayErrorOutcome): void {
    this.starting.set(false);
    if (outcome.kind === 'notFound') {
      this.invoice.set(null);
      this.view.set({ kind: 'notFound' });
      return;
    }
    this.outcome.set(outcome);
    // The server says the invoice is settled, so the page is out of date. An expired one is
    // not refetched: the server may still report it open.
    if (outcome.kind === 'settled') this.load();
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

  private handedOver(): BillingInvoice | null {
    const state: unknown = this.doc.defaultView?.history?.state;
    const candidate = (state as { invoice?: BillingInvoice } | null)?.invoice;
    return candidate && candidate.id === this.invoiceId ? candidate : null;
  }
}
