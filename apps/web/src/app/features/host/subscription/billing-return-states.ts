import {
  ChangeDetectionStrategy,
  Component,
  computed,
  input,
  output,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { Button, Card, Container, ErrorState, Skeleton } from '@hostelhive/ui';
import { LocaleLink } from '@core/i18n/locale-link';
import { ApiDate } from '@util/api-date';

/** What the payer went to Safepay to do: save a card, or start a subscription. */
export type ReturnSubject = 'card' | 'subscription';

/** Every state a card or subscription return page can be in. */
export type BillingReturnView =
  /** The link names no outcome this app knows. */
  | { kind: 'unclear' }
  /** No hostel to read billing for. */
  | { kind: 'missing' }
  | { kind: 'loading' }
  | { kind: 'confirming'; subject: ReturnSubject }
  | {
      kind: 'cardSaved';
      card: string;
      /** The plan is set to end, so the card will not renew it. */
      cancelling: boolean;
      /** The invoice the card was saved from, while it is still open. */
      invoice: { id: string; number: string } | null;
    }
  /** `trialEnds` is set during a free trial. */
  | { kind: 'subscribed'; plan: string; trialEnds: string | null }
  | { kind: 'slow'; subject: ReturnSubject; network: boolean }
  | { kind: 'cardCanceled'; cardKept: boolean }
  | { kind: 'subscriptionCanceled'; trialAvailable: boolean }
  | { kind: 'forbidden' }
  | { kind: 'error' };

type ViewKind = BillingReturnView['kind'];

/** Why Try again could not leave for Safepay: our copy, or the server's message verbatim. */
export type StartNote =
  | { key: 'hostPayment.cardStartForbidden' | 'hostPayment.cardStartFailed' }
  | { message: string };

interface Look {
  icon: string;
  /** Tint of the icon badge. */
  tint: string;
  spin?: boolean;
}

const LOOKS: Record<Exclude<ViewKind, 'loading' | 'error'>, Look> = {
  unclear: { icon: 'ti-help-circle', tint: 'bg-ink-100 text-ink-500' },
  missing: { icon: 'ti-link-off', tint: 'bg-ink-100 text-ink-500' },
  confirming: {
    icon: 'ti-loader-2',
    tint: 'bg-tint-sky text-brand-500',
    spin: true,
  },
  cardSaved: { icon: 'ti-circle-check', tint: 'bg-ok/10 text-ok' },
  subscribed: { icon: 'ti-circle-check', tint: 'bg-ok/10 text-ok' },
  slow: { icon: 'ti-clock', tint: 'bg-warn/10 text-warn' },
  cardCanceled: { icon: 'ti-credit-card', tint: 'bg-ink-100 text-ink-500' },
  subscriptionCanceled: {
    icon: 'ti-credit-card',
    tint: 'bg-ink-100 text-ink-500',
  },
  forbidden: { icon: 'ti-lock', tint: 'bg-ink-100 text-ink-500' },
};

/**
 * The page a host lands on when Safepay sends them back from saving a card or starting a
 * subscription, in whichever state it is in.
 *
 * Presentational: the return page decides the state and owns every request; this renders it
 * inside the public site's chrome as one centred card, like the invoice return pages.
 */
@Component({
  selector: 'hh-billing-return-states',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    Button,
    Card,
    Container,
    ErrorState,
    Skeleton,
    RouterLink,
    LocaleLink,
    TranslocoPipe,
    ApiDate,
  ],
  host: { class: 'block' },
  template: `
    <section hhContainer class="py-10 sm:py-16">
      <div class="mx-auto flex w-full max-w-xl flex-col gap-4">
        @switch (view().kind) {
          @case ('loading') {
            <div data-testid="return-loading">
              <hh-skeleton class="h-40 w-full" radius="lg" />
            </div>
          }
          @case ('error') {
            <hh-error-state
              [message]="'hostBilling.loadError' | transloco"
              [retryLabel]="'common.tryAgain' | transloco"
              (retry)="retry.emit()"
            />
            <a
              hh-button
              variant="text"
              size="sm"
              class="self-center"
              data-action="back-to-billing"
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
              <div role="status" aria-live="polite">
                @switch (view().kind) {
                  @case ('unclear') {
                    <h1 [class]="titleClass">
                      {{ 'hostPayment.unclearReturnTitle' | transloco }}
                    </h1>
                    <p [class]="messageClass">
                      {{ 'hostPayment.unclearReturnMessage' | transloco }}
                    </p>
                  }
                  @case ('missing') {
                    <h1 [class]="titleClass">
                      {{ 'hostPayment.missingHostelTitle' | transloco }}
                    </h1>
                    <p [class]="messageClass">
                      {{ 'hostPayment.missingHostelMessage' | transloco }}
                    </p>
                  }
                  @case ('confirming') {
                    <h1 [class]="titleClass">
                      @if (subject() === 'card') {
                        {{ 'hostPayment.cardConfirmingTitle' | transloco }}
                      } @else {
                        {{
                          'hostPayment.subscriptionConfirmingTitle' | transloco
                        }}
                      }
                    </h1>
                    <p [class]="messageClass">
                      {{ 'hostPayment.confirmingMessage' | transloco }}
                    </p>
                  }
                  @case ('cardSaved') {
                    <h1 [class]="titleClass">
                      {{ 'hostPayment.cardSavedTitle' | transloco }}
                    </h1>
                    @if (cardSaved(); as saved) {
                      <p [class]="messageClass">
                        @if (saved.cancelling) {
                          {{
                            'hostPayment.cardSavedCancellingMessage'
                              | transloco: { card: isolate(saved.card) }
                          }}
                        } @else {
                          {{
                            'hostPayment.cardSavedMessage'
                              | transloco: { card: isolate(saved.card) }
                          }}
                        }
                      </p>
                    }
                  }
                  @case ('subscribed') {
                    @if (subscribed(); as sub) {
                      @if (sub.trialEnds) {
                        <h1 [class]="titleClass">
                          {{ 'hostPayment.trialStartedTitle' | transloco }}
                        </h1>
                        <p [class]="messageClass">
                          {{
                            'hostPayment.trialStartedMessage'
                              | transloco
                                : {
                                    plan: sub.plan,
                                    date:
                                      (sub.trialEnds | apiDate: 'd MMM yyyy'),
                                  }
                          }}
                        </p>
                      } @else {
                        <h1 [class]="titleClass">
                          {{ 'hostPayment.subscribedTitle' | transloco }}
                        </h1>
                        <p [class]="messageClass">
                          {{
                            'hostPayment.subscribedMessage'
                              | transloco: { plan: sub.plan }
                          }}
                        </p>
                      }
                    }
                  }
                  @case ('slow') {
                    <h1 [class]="titleClass">
                      {{ 'hostPayment.safepayWaitingTitle' | transloco }}
                    </h1>
                    <p [class]="messageClass">
                      @if (subject() === 'card') {
                        {{ 'hostPayment.cardSlowMessage' | transloco }}
                      } @else {
                        {{ 'hostPayment.subscriptionSlowMessage' | transloco }}
                      }
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
                  @case ('cardCanceled') {
                    <h1 [class]="titleClass">
                      {{ 'hostPayment.cardCanceledTitle' | transloco }}
                    </h1>
                    <p [class]="messageClass">
                      {{ 'hostPayment.canceledMessage' | transloco }}
                    </p>
                    @if (cardKept()) {
                      <p [class]="messageClass" data-field="card-kept">
                        {{ 'hostPayment.cardStillSaved' | transloco }}
                      </p>
                    }
                  }
                  @case ('subscriptionCanceled') {
                    <h1 [class]="titleClass">
                      {{ 'hostPayment.subscriptionCanceledTitle' | transloco }}
                    </h1>
                    <p [class]="messageClass">
                      {{ 'hostPayment.canceledMessage' | transloco }}
                    </p>
                    @if (trialAvailable()) {
                      <p [class]="messageClass" data-field="trial-available">
                        {{ 'hostPayment.trialStillAvailable' | transloco }}
                      </p>
                    }
                  }
                  @case ('forbidden') {
                    <h1 [class]="titleClass">
                      {{ 'hostBilling.noAccessTitle' | transloco }}
                    </h1>
                    <p [class]="messageClass">
                      {{ 'hostBilling.noAccessMessage' | transloco }}
                    </p>
                  }
                }
              </div>

              <div
                class="mt-6 flex flex-col items-stretch gap-2 sm:flex-row sm:flex-wrap sm:justify-center"
              >
                @switch (view().kind) {
                  @case ('confirming') {
                    <!-- Nothing to do but wait. -->
                  }
                  @case ('missing') {
                    <a
                      hh-button
                      color="primary"
                      data-action="go-to-hostels"
                      routerLink="/host"
                      >{{ 'hostPayment.goToHostels' | transloco }}</a
                    >
                  }
                  @case ('slow') {
                    <button
                      hh-button
                      type="button"
                      color="primary"
                      data-action="check-again"
                      (click)="retry.emit()"
                    >
                      {{ 'hostPayment.checkAgain' | transloco }}
                    </button>
                    <a
                      hh-button
                      variant="text"
                      data-action="back-to-billing"
                      [routerLink]="billingLink()"
                      >{{ 'hostBilling.backToBilling' | transloco }}</a
                    >
                  }
                  @case ('cardCanceled') {
                    <button
                      hh-button
                      type="button"
                      color="primary"
                      data-action="try-again"
                      [loading]="starting()"
                      (click)="tryAgain.emit()"
                    >
                      {{
                        (starting()
                          ? 'hostPayment.redirecting'
                          : 'common.tryAgain'
                        ) | transloco
                      }}
                    </button>
                    <a
                      hh-button
                      variant="text"
                      data-action="back-to-billing"
                      [routerLink]="billingLink()"
                      >{{ 'hostBilling.backToBilling' | transloco }}</a
                    >
                  }
                  @default {
                    @if (payLink(); as pay) {
                      <a
                        hh-button
                        color="primary"
                        data-action="pay-invoice"
                        [routerLink]="pay.commands"
                        >{{
                          'hostPayment.payInvoice'
                            | transloco: { number: pay.number }
                        }}</a
                      >
                    }
                    <a
                      hh-button
                      [color]="payLink() ? 'default' : 'primary'"
                      [variant]="payLink() ? 'text' : 'filled'"
                      data-action="go-to-billing"
                      [routerLink]="billingLink()"
                      >{{ 'hostPayment.goToBilling' | transloco }}</a
                    >
                  }
                }
              </div>

              @if (note(); as n) {
                <p
                  class="mt-3 text-sm text-danger"
                  role="alert"
                  data-field="start-note"
                >
                  @if ('message' in n) {
                    {{ n.message }}
                  } @else {
                    {{ n.key | transloco }}
                  }
                </p>
              }
            </hh-card>
          }
        }
      </div>
    </section>
  `,
})
export class BillingReturnStates {
  readonly view = input.required<BillingReturnView>();
  /** Router commands for the hostel's billing screen, before localisation. */
  readonly billingLink = input.required<readonly unknown[]>();
  /** Try again is leaving for Safepay. */
  readonly starting = input(false);
  readonly startNote = input<StartNote | null>(null);

  /** Check again after a slow wait, or retry a failed read. */
  readonly retry = output<void>();
  /** Leave for Safepay again to save the card. */
  readonly tryAgain = output<void>();

  protected readonly titleClass =
    'mt-4 font-display text-xl font-semibold text-ink-900';
  protected readonly messageClass = 'mt-1 text-sm text-ink-500';

  protected readonly look = computed(() => {
    const kind = this.view().kind;
    return kind === 'loading' || kind === 'error' ? null : LOOKS[kind];
  });

  protected readonly subject = computed(() => {
    const view = this.view();
    return view.kind === 'confirming' || view.kind === 'slow'
      ? view.subject
      : null;
  });

  protected readonly cardSaved = computed(() => {
    const view = this.view();
    return view.kind === 'cardSaved' ? view : null;
  });

  protected readonly subscribed = computed(() => {
    const view = this.view();
    return view.kind === 'subscribed' ? view : null;
  });

  protected readonly networkHint = computed(() => {
    const view = this.view();
    return view.kind === 'slow' && view.network;
  });

  protected readonly cardKept = computed(() => {
    const view = this.view();
    return view.kind === 'cardCanceled' && view.cardKept;
  });

  protected readonly trialAvailable = computed(() => {
    const view = this.view();
    return view.kind === 'subscriptionCanceled' && view.trialAvailable;
  });

  /** The open invoice the card was saved from, to pay next. */
  protected readonly payLink = computed(() => {
    const invoice = this.cardSaved()?.invoice;
    if (!invoice) return null;
    return {
      commands: [...this.billingLink(), 'pay', invoice.id],
      number: invoice.number,
    };
  });

  /** Unicode isolates around an interpolated card label, the plain-text form of `<bdi>`. */
  protected isolate(text: string): string {
    return `⁨${text}⁩`;
  }

  protected readonly note = computed(() =>
    this.view().kind === 'cardCanceled' ? this.startNote() : null,
  );
}
