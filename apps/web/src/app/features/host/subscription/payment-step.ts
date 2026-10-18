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
import type {
  ApiError,
  BillingInvoice,
  StartedPayment,
} from '@hostelhive/data-access';
import {
  Button,
  ConfirmModal,
  ErrorState,
  HhLink,
  Skeleton,
  StatusPill,
} from '@hostelhive/ui';
import { BillingApi, HostBillingStore } from '@services';
import { SessionStore } from '@core/auth/session-store';
import { LocaleLink } from '@core/i18n/locale-link';
import { DashboardLayout } from '@layout/dashboard-layout/dashboard-layout';
import { ApiDate } from '@util/api-date';
import { isNetworkError } from '@util/network-error';
import {
  AttemptNotice,
  billingInvoicePath,
  billingInvoiceStatusKey,
  invoiceStatusTone,
  isSafepayBilled,
  latestAttemptNotice,
} from '@app/shared/billing/billing-labels';
import { BillingMoneyPipe } from '@app/shared/billing/billing-money.pipe';
import { InvoiceSummary } from './invoice-summary';
import { PollTick, pollInvoice } from './invoice-poll';
import { ReturnView } from './payment-return-states';
import { settledView } from './payment-success';
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

/** What a start that leaves the page is for: paying at Safepay, or saving a card there. */
type Leaving = 'pay' | 'card';

/**
 * The payment step for one HostelHive invoice: what is being paid for, and a button that hands
 * the payer to Safepay or, with a card on file, charges that card without leaving.
 *
 * The invoice is always read from the server; one handed over in the router's navigation state
 * only fills the page while that request is in flight. Paid, void and unknown invoices are
 * shown without a Pay button, and a refused start is explained with the server's own words
 * (never for a 403) or with ours. A saved-card charge reads paid only once the invoice does.
 */
@Component({
  selector: 'hh-payment-step',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    DashboardLayout,
    InvoiceSummary,
    Button,
    ConfirmModal,
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
  private readonly billingStore = inject(HostBillingStore);
  private readonly session = inject(SessionStore);
  private readonly destroyRef = inject(DestroyRef);
  private readonly doc = inject(DOCUMENT);

  private readonly invoiceId =
    this.route.snapshot.paramMap.get('invoiceId') ?? '';

  // The hostel id sits on an ancestor route, so it is found by walking up from here.
  protected readonly hostelId =
    this.route.pathFromRoot
      .map((r) => r.snapshot.paramMap.get('hostelId'))
      .filter((id): id is string => !!id)
      .at(-1) ?? null;

  private loading: Subscription | null = null;
  private chargePoll: Subscription | null = null;

  protected readonly invoice = signal<BillingInvoice | null>(this.handedOver());
  protected readonly view = signal<LoadView>({ kind: 'loading' });
  protected readonly leaving = signal<Leaving | null>(null);
  protected readonly starting = computed(() => this.leaving() !== null);
  protected readonly outcome = signal<PayErrorOutcome | null>(null);
  /** A saved-card charge, or the wait for it to settle, is in flight. */
  protected readonly charging = signal(false);
  protected readonly confirmingCharge = signal(false);
  /** The wait for a saved-card charge ran out before the server settled it. */
  protected readonly chargeSlow = signal(false);
  protected readonly saveCard = signal(false);
  protected readonly saveCardHintId = `hh-save-card-hint-${this.invoiceId}`;

  protected readonly billingLink = this.hostelId
    ? `/host/${this.hostelId}/subscription`
    : '/host';

  protected readonly invoiceLink = this.hostelId
    ? billingInvoicePath(this.hostelId, this.invoiceId)
    : null;

  protected readonly canPay = computed(() =>
    this.session.hasPermission('core:Invoice:create_payment'),
  );

  protected readonly slug = computed(() => this.invoice()?.status?.slug ?? '');

  protected readonly tone = computed(() => invoiceStatusTone(this.slug()));

  /** Our label key for a known status; an unknown one shows the server's own name. */
  protected readonly statusKey = computed(() =>
    billingInvoiceStatusKey(this.slug()),
  );

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

  protected readonly busy = computed(() => this.starting() || this.charging());

  /** The billing of this page's hostel, once the console has loaded it; null otherwise. */
  private readonly billing = computed(() => {
    const id = this.hostelId;
    return id && this.billingStore.hostelId() === id
      ? this.billingStore.billing()
      : null;
  });

  /** The ways to pay that involve a card; none while Safepay Subscriptions bills the plan. */
  private readonly cardMethods = computed(() => {
    const billing = this.billing();
    return billing && !isSafepayBilled(billing.subscription)
      ? billing.payment_methods
      : [];
  });

  protected readonly savedCard = computed(
    () => this.billing()?.saved_card ?? null,
  );

  // The server reopens a pending checkout as it was first opened, so a tick could not change it.
  private readonly checkoutPending = computed(
    () =>
      this.invoice()?.payments?.some(
        (p) => p.payment_method === 'safepay' && p.status?.slug === 'pending',
      ) ?? false,
  );

  protected readonly offerSaveCard = computed(
    () => this.cardMethods().includes('safepay') && !this.checkoutPending(),
  );

  protected readonly saveCardLocked = computed(
    () => this.cardMethods().includes('safepay') && this.checkoutPending(),
  );

  protected readonly offerSavedCard = computed(
    () => this.cardMethods().includes('saved_card') && !!this.savedCard(),
  );

  protected readonly declined = computed(
    () => this.outcome()?.kind === 'declined',
  );

  protected readonly payForbidden = computed(
    () => !this.canPay() || this.outcome()?.kind === 'forbidden',
  );

  constructor() {
    this.load();
    // A page restored from the back-forward cache still shows the spinner it left with.
    this.checkout.restored$
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => {
        this.leaving.set(null);
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
    if (this.busy() || !this.showPay()) return;
    this.leaving.set('pay');
    this.clearRefusal();
    this.checkout
      .start(this.invoiceId, this.hostelId, {
        saveCard: this.offerSaveCard() && this.saveCard(),
      })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        // The browser is leaving for Safepay, so the button keeps its spinner until it does.
        error: (err: unknown) => this.startFailed(payErrorOutcome(err)),
      });
  }

  /** Leaves for Safepay to replace the declined card, coming back to this invoice afterwards. */
  protected updateCard(): void {
    const hostelId = this.hostelId;
    if (this.busy() || !hostelId) return;
    this.leaving.set('card');
    this.clearRefusal();
    this.checkout
      .startCardSave(hostelId, this.savedCard(), this.invoiceId)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        error: (err: unknown) => this.startFailed(payErrorOutcome(err)),
      });
  }

  protected askCharge(): void {
    if (this.busy() || !this.showPay() || !this.offerSavedCard()) return;
    this.confirmingCharge.set(true);
  }

  protected dismissCharge(): void {
    this.confirmingCharge.set(false);
  }

  protected confirmCharge(): void {
    if (!this.confirmingCharge()) return;
    this.confirmingCharge.set(false);
    if (this.busy() || !this.showPay()) return;
    this.charging.set(true);
    this.chargeSlow.set(false);
    this.outcome.set(null);
    this.api
      .payWithSavedCard(this.invoiceId)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (started) => this.charged(started),
        error: (err: unknown) => this.startFailed(payErrorOutcome(err)),
      });
  }

  /** Waits again for a saved-card charge the server had not settled in time. */
  protected checkCharge(): void {
    if (this.busy()) return;
    this.watchCharge();
  }

  private charged({ payment, invoice }: StartedPayment): void {
    if (
      payment.status?.slug === 'succeeded' &&
      invoice.status?.slug === 'paid'
    ) {
      this.charging.set(false);
      this.invoice.set(invoice);
      this.billingStore.refresh();
      return;
    }
    // Safepay had not answered by the time the server replied; refreshing settles it once it does.
    this.watchCharge();
  }

  private watchCharge(): void {
    this.chargePoll?.unsubscribe();
    this.charging.set(true);
    this.chargeSlow.set(false);

    let last: PollTick | null = null;
    let settled = false;
    this.chargePoll = pollInvoice(
      () => this.api.refreshInvoicePayments(this.invoiceId),
      { until: (tick) => settledView(tick) !== null },
    )
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (tick) => {
          last = tick;
          const view = settledView(tick);
          if (!view) return;
          settled = true;
          this.chargeSettled(tick, view);
        },
        complete: () => {
          if (settled) return;
          this.charging.set(false);
          if (last && 'invoice' in last) this.invoice.set(last.invoice);
          this.chargeSlow.set(true);
        },
      });
  }

  private chargeSettled(tick: PollTick, view: ReturnView): void {
    this.charging.set(false);
    this.outcome.set(null);
    if (view.kind === 'forbidden') {
      this.outcome.set({ kind: 'forbidden' });
      return;
    }
    if (view.kind === 'notFound') {
      this.invoice.set(null);
      this.view.set({ kind: 'notFound' });
      return;
    }
    // A failed charge is told by the invoice's own attempt notice.
    if ('invoice' in tick) this.invoice.set(tick.invoice);
    if (view.kind === 'paid') this.billingStore.refresh();
  }

  /** Drops the last refusal before a new start. A decline stays, since the actions it offers are what is starting. */
  private clearRefusal(): void {
    if (!this.declined()) this.outcome.set(null);
  }

  private startFailed(outcome: PayErrorOutcome): void {
    this.leaving.set(null);
    this.charging.set(false);
    if (outcome.kind === 'inProgress') {
      // A card charge for this invoice is already running: say so and wait for it to settle.
      this.outcome.set(outcome);
      this.watchCharge();
      return;
    }
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
