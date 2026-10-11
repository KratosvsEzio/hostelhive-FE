import {
  ChangeDetectionStrategy,
  Component,
  computed,
  input,
  output,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import {
  Button,
  Card,
  Container,
  ErrorState,
  Skeleton,
  StatusPill,
} from '@hostelhive/ui';
import type { BillingInvoice } from '@hostelhive/data-access';
import { LocaleLink } from '@core/i18n/locale-link';
import { ApiDate } from '@util/api-date';
import { InvoiceSummary } from './invoice-summary';
import type { RetryState } from './payment-return-retry';

/** Every state a payment return page can be in. */
export type ReturnView =
  | { kind: 'missing' }
  | { kind: 'loading' }
  | { kind: 'loadError' }
  | { kind: 'confirming' }
  | { kind: 'paid' }
  /** Voided while the payer was on Safepay: they may have been charged. */
  | { kind: 'voidAfterPay' }
  /** Voided, with no payment in question. */
  | { kind: 'void' }
  | { kind: 'failed'; charged: boolean }
  | { kind: 'slow'; network: boolean }
  | { kind: 'cancelled' }
  | { kind: 'expired'; message: string }
  /** A status this app has no copy for: shown by name, with nothing to act on. */
  | { kind: 'unknown' }
  | { kind: 'forbidden' }
  | { kind: 'notFound' };

type ReturnKind = ReturnView['kind'];

interface Look {
  icon: string;
  /** Tint of the icon badge. */
  tint: string;
  spin?: boolean;
}

const LOOKS: Record<Exclude<ReturnKind, 'loading' | 'loadError'>, Look> = {
  missing: { icon: 'ti-link-off', tint: 'bg-ink-100 text-ink-500' },
  confirming: {
    icon: 'ti-loader-2',
    tint: 'bg-tint-sky text-brand-500',
    spin: true,
  },
  paid: { icon: 'ti-circle-check', tint: 'bg-ok/10 text-ok' },
  voidAfterPay: { icon: 'ti-receipt-off', tint: 'bg-warn/10 text-warn' },
  void: { icon: 'ti-receipt-off', tint: 'bg-ink-100 text-ink-500' },
  failed: { icon: 'ti-circle-x', tint: 'bg-danger/10 text-danger' },
  slow: { icon: 'ti-clock', tint: 'bg-warn/10 text-warn' },
  cancelled: { icon: 'ti-credit-card', tint: 'bg-ink-100 text-ink-500' },
  expired: { icon: 'ti-receipt-off', tint: 'bg-ink-100 text-ink-500' },
  unknown: { icon: 'ti-receipt', tint: 'bg-ink-100 text-ink-500' },
  forbidden: { icon: 'ti-lock', tint: 'bg-ink-100 text-ink-500' },
  notFound: { icon: 'ti-help-circle', tint: 'bg-ink-100 text-ink-500' },
};

// The states that know which invoice they are about, and so show what it is for.
const WITH_SUMMARY = new Set<ReturnKind>([
  'confirming',
  'paid',
  'voidAfterPay',
  'void',
  'failed',
  'slow',
  'cancelled',
  'unknown',
]);

// Where Go to billing is the page's only way on, it is the main action.
const PRIMARY_LINK = new Set<ReturnKind>([
  'paid',
  'missing',
  'unknown',
  'forbidden',
  'notFound',
]);

/**
 * The page a payer lands on when Safepay sends them back, in whichever state it is in.
 *
 * Presentational: the success and cancel pages decide the state and own every request; this
 * renders it inside the public site's chrome as one centred card, with the invoice summary
 * beneath once the invoice is known.
 */
@Component({
  selector: 'hh-payment-return-states',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    Button,
    Card,
    Container,
    ErrorState,
    Skeleton,
    StatusPill,
    RouterLink,
    LocaleLink,
    TranslocoPipe,
    ApiDate,
    InvoiceSummary,
  ],
  host: { class: 'block' },
  template: `
    <section hhContainer class="py-10 sm:py-16">
      <div class="mx-auto flex w-full max-w-xl flex-col gap-4">
        @switch (view().kind) {
          @case ('loading') {
            <div class="flex flex-col gap-3" data-testid="return-loading">
              <hh-skeleton class="h-40 w-full" radius="lg" />
              <hh-skeleton class="h-32 w-full" radius="lg" />
            </div>
          }
          @case ('loadError') {
            <hh-error-state
              [message]="'hostBilling.invoiceLoadError' | transloco"
              [retryLabel]="'common.tryAgain' | transloco"
              (retry)="reload.emit()"
            />
            <a
              hh-button
              variant="text"
              size="sm"
              class="self-center"
              [routerLink]="billingLink()"
              >{{ 'hostBilling.backToBilling' | transloco }}</a
            >
          }
          @default {
            <hh-card class="text-center" data-testid="return-card">
              @if (look(); as l) {
                <span
                  class="mx-auto grid h-12 w-12 place-items-center rounded-full"
                  [class]="l.tint"
                >
                  <i
                    class="ti text-2xl"
                    [class]="l.icon"
                    [class.animate-spin]="!!l.spin"
                    aria-hidden="true"
                  ></i>
                </span>
              }
              @if (invoice(); as inv) {
                <p class="mt-4 text-sm text-ink-500" data-field="number">
                  {{
                    'hostBilling.invoiceNumber'
                      | transloco: { number: inv.number }
                  }}
                  @if (view().kind === 'paid') {
                    <hh-status-pill tone="ok" class="ms-1">{{
                      'hostPayment.paidPill' | transloco
                    }}</hh-status-pill>
                  }
                </p>
              }
              <div role="status" aria-live="polite">
                @switch (view().kind) {
                  @case ('missing') {
                    <h1 [class]="titleClass">
                      {{ 'hostPayment.missingInvoiceTitle' | transloco }}
                    </h1>
                    <p [class]="messageClass">
                      {{ 'hostPayment.missingInvoiceMessage' | transloco }}
                    </p>
                  }
                  @case ('confirming') {
                    <h1 [class]="titleClass">
                      {{ 'hostPayment.confirmingTitle' | transloco }}
                    </h1>
                    <p [class]="messageClass">
                      {{ 'hostPayment.confirmingMessage' | transloco }}
                    </p>
                  }
                  @case ('paid') {
                    <h1 [class]="titleClass">
                      {{ 'hostPayment.successTitle' | transloco }}
                    </h1>
                    <p [class]="messageClass">
                      {{
                        'hostPayment.successMessage'
                          | transloco: { number: invoiceNumber() }
                      }}
                    </p>
                    @if (invoice()?.paid_at; as paidAt) {
                      <p class="mt-1 text-sm text-ink-500" data-field="paid-on">
                        {{
                          'hostPayment.paidOn'
                            | transloco
                              : { date: (paidAt | apiDate: 'd MMM yyyy') }
                        }}
                      </p>
                    }
                  }
                  @case ('voidAfterPay') {
                    <h1 [class]="titleClass">
                      {{ 'hostPayment.voidAfterPayTitle' | transloco }}
                    </h1>
                    <p [class]="messageClass">
                      {{
                        'hostPayment.voidAfterPayMessage'
                          | transloco: { number: invoiceNumber() }
                      }}
                    </p>
                  }
                  @case ('void') {
                    <h1 [class]="titleClass">
                      {{ 'hostPayment.voidTitle' | transloco }}
                    </h1>
                    <p [class]="messageClass">
                      {{ 'hostPayment.voidMessage' | transloco }}
                    </p>
                  }
                  @case ('failed') {
                    <h1 [class]="titleClass">
                      {{ 'hostPayment.failedTitle' | transloco }}
                    </h1>
                    <p [class]="messageClass">
                      @if (charged()) {
                        {{
                          'hostPayment.chargedNotApplied'
                            | transloco: { number: invoiceNumber() }
                        }}
                      } @else {
                        {{ 'hostPayment.failedMessage' | transloco }}
                      }
                    </p>
                  }
                  @case ('slow') {
                    <h1 [class]="titleClass">
                      {{ 'hostPayment.slowTitle' | transloco }}
                    </h1>
                    <p [class]="messageClass">
                      {{ 'hostPayment.slowMessage' | transloco }}
                    </p>
                    @if (networkHint()) {
                      <p
                        class="mt-2 text-sm font-medium text-ink-700"
                        data-field="network-hint"
                      >
                        {{ 'hostPayment.slowNetworkHint' | transloco }}
                      </p>
                    }
                  }
                  @case ('cancelled') {
                    <h1 [class]="titleClass">
                      {{ 'hostPayment.cancelTitle' | transloco }}
                    </h1>
                    <p [class]="messageClass">
                      {{
                        'hostPayment.cancelMessage'
                          | transloco: { number: invoiceNumber() }
                      }}
                    </p>
                  }
                  @case ('expired') {
                    <h1 [class]="titleClass">
                      {{ 'hostPayment.voidTitle' | transloco }}
                    </h1>
                    <p [class]="messageClass" data-field="server-message">
                      {{ expiredMessage() }}
                    </p>
                  }
                  @case ('unknown') {
                    <!-- A status with no copy of its own is named as the server returned it. -->
                    <h1 [class]="titleClass">{{ invoice()?.status?.name }}</h1>
                  }
                  @case ('forbidden') {
                    <h1 [class]="titleClass">
                      {{ 'hostBilling.noAccessTitle' | transloco }}
                    </h1>
                    <p [class]="messageClass">
                      {{ 'hostBilling.noAccessMessage' | transloco }}
                    </p>
                  }
                  @case ('notFound') {
                    <h1 [class]="titleClass">
                      {{ 'hostPayment.notFoundTitle' | transloco }}
                    </h1>
                    <p [class]="messageClass">
                      {{ 'hostPayment.notFoundMessage' | transloco }}
                    </p>
                  }
                }
              </div>

              <div
                class="mt-6 flex flex-col items-stretch gap-2 sm:flex-row sm:flex-wrap sm:justify-center"
              >
                @if (offersTryAgain()) {
                  <button
                    hh-button
                    type="button"
                    color="primary"
                    data-action="try-again"
                    [loading]="retry().starting"
                    (click)="tryAgain.emit()"
                  >
                    {{
                      (retry().starting
                        ? 'hostPayment.redirecting'
                        : 'common.tryAgain'
                      ) | transloco
                    }}
                  </button>
                }
                @if (view().kind === 'slow') {
                  <button
                    hh-button
                    type="button"
                    color="primary"
                    data-action="check-again"
                    (click)="checkAgain.emit()"
                  >
                    {{ 'hostPayment.checkAgain' | transloco }}
                  </button>
                }
                @if (view().kind === 'voidAfterPay' || charged()) {
                  <a
                    hh-button
                    variant="outlined"
                    data-action="contact-us"
                    routerLink="/contact"
                    >{{ 'common.contactUs' | transloco }}</a
                  >
                }
                @if (choosesPlanAgain()) {
                  <a
                    hh-button
                    color="primary"
                    data-action="choose-plan-again"
                    [routerLink]="billingLink()"
                    >{{ 'hostPayment.choosePlanAgain' | transloco }}</a
                  >
                } @else if (view().kind === 'cancelled') {
                  <a
                    hh-button
                    variant="text"
                    data-action="back-to-billing"
                    [routerLink]="billingLink()"
                    >{{ 'hostBilling.backToBilling' | transloco }}</a
                  >
                } @else if (view().kind !== 'confirming') {
                  <a
                    hh-button
                    [color]="primaryLink() ? 'primary' : 'default'"
                    [variant]="primaryLink() ? 'filled' : 'text'"
                    data-action="go-to-billing"
                    [routerLink]="billingLink()"
                    >{{ 'hostPayment.goToBilling' | transloco }}</a
                  >
                }
              </div>

              @if (retryNote(); as note) {
                <p
                  class="mt-3 text-sm text-danger"
                  role="alert"
                  data-field="retry-note"
                >
                  @if ('message' in note) {
                    {{ note.message }}
                  } @else {
                    {{ note.key | transloco }}
                  }
                </p>
              }
            </hh-card>

            @if (summaryInvoice(); as inv) {
              <hh-invoice-summary [invoice]="inv" />
            }
          }
        }
      </div>
    </section>
  `,
})
export class PaymentReturnStates {
  readonly view = input.required<ReturnView>();
  readonly invoice = input<BillingInvoice | null>(null);
  /** Router commands for the hostel's billing screen, before localisation. */
  readonly billingLink = input.required<readonly unknown[]>();
  readonly retry = input<RetryState>({
    starting: false,
    available: true,
    note: null,
  });

  readonly tryAgain = output<void>();
  readonly checkAgain = output<void>();
  readonly reload = output<void>();

  protected readonly titleClass =
    'mt-4 font-display text-xl font-semibold text-ink-900';
  protected readonly messageClass = 'mt-1 text-sm text-ink-500';

  protected readonly look = computed(() => {
    const kind = this.view().kind;
    return kind === 'loading' || kind === 'loadError' ? null : LOOKS[kind];
  });

  protected readonly invoiceNumber = computed(
    () => this.invoice()?.number ?? '',
  );

  protected readonly summaryInvoice = computed(() =>
    WITH_SUMMARY.has(this.view().kind) ? this.invoice() : null,
  );

  protected readonly charged = computed(() => {
    const view = this.view();
    return view.kind === 'failed' && view.charged;
  });

  protected readonly networkHint = computed(() => {
    const view = this.view();
    return view.kind === 'slow' && view.network;
  });

  protected readonly expiredMessage = computed(() => {
    const view = this.view();
    return view.kind === 'expired' ? view.message : '';
  });

  protected readonly offersTryAgain = computed(() => {
    const kind = this.view().kind;
    return (
      (kind === 'failed' || kind === 'cancelled') && this.retry().available
    );
  });

  protected readonly retryNote = computed(() => {
    const kind = this.view().kind;
    return kind === 'failed' || kind === 'cancelled' ? this.retry().note : null;
  });

  protected readonly choosesPlanAgain = computed(() => {
    const kind = this.view().kind;
    return kind === 'void' || kind === 'expired';
  });

  protected readonly primaryLink = computed(() =>
    PRIMARY_LINK.has(this.view().kind),
  );
}
