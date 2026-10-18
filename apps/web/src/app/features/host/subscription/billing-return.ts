import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  InjectionToken,
  inject,
  signal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute } from '@angular/router';
import type { ParamMap } from '@angular/router';
import { Subscription } from 'rxjs';
import type { ApiError, HostBilling, SavedCard } from '@hostelhive/data-access';
import { BillingApi, HostBillingStore } from '@services';
import { isNetworkError } from '@util/network-error';
import { isSafepayBilled } from '@app/shared/billing/billing-labels';
import {
  BillingReturnStates,
  BillingReturnView,
  ReturnSubject,
  StartNote,
} from './billing-return-states';
import { PollResult, pollUntil } from './invoice-poll';
import {
  ReturnStash,
  SafepayCheckout,
  payErrorOutcome,
  returnParam,
} from './safepay-checkout';

/** Which of Safepay's two return addresses the page was reached by. */
export type ReturnMode = 'success' | 'cancel';

/** The return address this page was reached by, provided by its route. */
export const BILLING_RETURN_MODE = new InjectionToken<ReturnMode>(
  'BILLING_RETURN_MODE',
);

/** What Safepay says happened, as far as the link alone can tell. */
export type ReturnIntent =
  | { subject: 'card'; outcome: 'saved' | 'canceled' }
  | { subject: 'subscription'; outcome: 'started' | 'canceled' };

/**
 * The outcome a return link names, or null when it names none this address can send:
 * `?card=saved` and `?subscription=started` come back on success, `canceled` on cancel.
 */
export function returnIntent(
  mode: ReturnMode,
  params: Pick<ParamMap, 'get' | 'has'>,
): ReturnIntent | null {
  const subject = returnSubject(params);
  const value = returnParam(params, subject);
  if (mode === 'cancel') {
    return value === 'canceled' ? { subject, outcome: 'canceled' } : null;
  }
  if (subject === 'card') {
    return value === 'saved' ? { subject, outcome: 'saved' } : null;
  }
  return value === 'started' ? { subject, outcome: 'started' } : null;
}

/** Whether a return link is about a card or a subscription; a card wins when it names both. */
export function returnSubject(params: Pick<ParamMap, 'has'>): ReturnSubject {
  return params.has('card') ? 'card' : 'subscription';
}

/**
 * Whether the card Safepay was asked to save has reached billing: any card where there was
 * none, else one that differs from the card on file before leaving.
 */
export function cardLanded(
  card: SavedCard | null,
  previous: SavedCard | null,
): card is SavedCard {
  if (!card) return false;
  if (!previous) return true;
  return (
    card.label !== previous.label || card.expires_on !== previous.expires_on
  );
}

function cardSavedView(
  billing: HostBilling,
  card: SavedCard,
  invoiceId: string | undefined,
): BillingReturnView {
  const open = billing.open_invoice;
  return {
    kind: 'cardSaved',
    card: card.label,
    cancelling: !!billing.subscription?.cancel_at_period_end,
    invoice:
      invoiceId && open?.id === invoiceId
        ? { id: open.id, number: open.number }
        : null,
  };
}

function subscribedView(billing: HostBilling): BillingReturnView {
  const sub = billing.subscription;
  return {
    kind: 'subscribed',
    plan: sub?.plan.name ?? '',
    trialEnds:
      sub?.safepay_status === 'TRAILING' ? sub.current_period_end : null,
  };
}

/** The state a poll result settles the page in, or null while it is still confirming. */
export function settledReturnView(
  result: PollResult<HostBilling>,
  subject: ReturnSubject,
  stash: ReturnStash | null,
): BillingReturnView | null {
  if ('error' in result) {
    return result.error?.status === 403 ? { kind: 'forbidden' } : null;
  }
  const billing = result.value;
  if (subject === 'subscription') {
    return isSafepayBilled(billing.subscription)
      ? subscribedView(billing)
      : null;
  }
  const left = stash?.kind === 'card' ? stash : null;
  const card = billing.saved_card;
  return cardLanded(card, left?.previous ?? null)
    ? cardSavedView(billing, card, left?.invoiceId)
    : null;
}

/** The state a cancelled return shows, from billing read once. */
export function canceledReturnView(
  billing: HostBilling,
  subject: ReturnSubject,
  stash: ReturnStash | null,
): BillingReturnView {
  if (subject === 'card') {
    return { kind: 'cardCanceled', cardKept: !!billing.saved_card };
  }
  // Safepay's webhook may have started it before the payer pressed back.
  if (isSafepayBilled(billing.subscription)) return subscribedView(billing);
  const planId = stash?.kind === 'subscription' ? stash.planId : null;
  const plan = billing.plans.find((p) => p.id === planId);
  return {
    kind: 'subscriptionCanceled',
    trialAvailable: (plan?.trial_days ?? 0) > 0,
  };
}

/** The state a poll that ran out of time leaves the page in. */
function timedOutView(
  subject: ReturnSubject,
  last: PollResult<HostBilling> | null,
): BillingReturnView {
  if (last && 'error' in last && !isNetworkError(last.error)) {
    return { kind: 'error' };
  }
  return { kind: 'slow', subject, network: !!last && 'error' in last };
}

function startFailureNote(err: unknown): StartNote {
  const outcome = payErrorOutcome(err);
  if (outcome.kind === 'forbidden') {
    return { key: 'hostPayment.cardStartForbidden' };
  }
  if ('message' in outcome) return { message: outcome.message };
  return { key: 'hostPayment.cardStartFailed' };
}

/**
 * Where Safepay sends a host back after saving a card (`?card=saved|canceled`) or starting a
 * subscription (`?subscription=started|canceled`).
 *
 * Both finish on Safepay's webhook, so arriving proves nothing: a success polls the hostel's
 * billing until the card or the Safepay-billed plan shows up, and says so honestly when it has
 * not within the poll's window. A cancel reads billing once to say what is still in place.
 */
@Component({
  selector: 'hh-billing-return',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [BillingReturnStates],
  template: `
    <hh-billing-return-states
      [view]="view()"
      [billingLink]="billingLink"
      [starting]="starting()"
      [startNote]="startNote()"
      (retry)="check()"
      (tryAgain)="tryAgain()"
    />
  `,
})
export class BillingReturn {
  private readonly api = inject(BillingApi);
  private readonly checkout = inject(SafepayCheckout);
  private readonly store = inject(HostBillingStore);
  private readonly destroyRef = inject(DestroyRef);
  private readonly params = inject(ActivatedRoute).snapshot.queryParamMap;

  private readonly intent = returnIntent(
    inject(BILLING_RETURN_MODE),
    this.params,
  );
  // Read before a settled return clears the stash they are derived from.
  private readonly stash = this.checkout.returnStash();
  private readonly hostelId = this.checkout.returnHostelFor(
    returnSubject(this.params),
  );

  protected readonly billingLink: readonly unknown[] = this.hostelId
    ? ['/host', this.hostelId, 'subscription']
    : ['/host'];

  protected readonly view = signal<BillingReturnView>(this.initialView());
  protected readonly starting = signal(false);
  protected readonly startNote = signal<StartNote | null>(null);

  /** The card on file as last read, handed to Try again as the one to replace. */
  private card: SavedCard | null = null;
  private request: Subscription | null = null;

  constructor() {
    this.check();
    // Back from Safepay out of the back-forward cache: the webhook may have landed meanwhile.
    this.checkout.restored$
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => {
        this.starting.set(false);
        this.check();
      });
  }

  /** Polls or reads billing for what the link says happened; called again by Check again. */
  protected check(): void {
    const { intent, hostelId } = this;
    if (!intent || !hostelId) return;
    this.request?.unsubscribe();
    if (intent.outcome === 'canceled') {
      this.readOnce(hostelId, intent.subject);
    } else {
      this.poll(hostelId, intent.subject);
    }
  }

  protected tryAgain(): void {
    const { hostelId, stash } = this;
    if (!hostelId || this.starting()) return;
    this.starting.set(true);
    this.startNote.set(null);
    const invoiceId = stash?.kind === 'card' ? stash.invoiceId : undefined;
    this.checkout
      .startCardSave(hostelId, this.card, invoiceId)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        error: (err: unknown) => {
          this.starting.set(false);
          this.startNote.set(startFailureNote(err));
        },
      });
  }

  private initialView(): BillingReturnView {
    if (!this.intent) return { kind: 'unclear' };
    if (!this.hostelId) return { kind: 'missing' };
    return this.intent.outcome === 'canceled'
      ? { kind: 'loading' }
      : { kind: 'confirming', subject: this.intent.subject };
  }

  private poll(hostelId: string, subject: ReturnSubject): void {
    this.view.set({ kind: 'confirming', subject });
    let last: PollResult<HostBilling> | null = null;
    let settled = false;
    this.request = pollUntil(() => this.api.billing(hostelId), {
      done: (result) => settledReturnView(result, subject, this.stash) !== null,
    })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (result) => {
          last = result;
          if ('value' in result) this.accept(hostelId, result.value);
          const view = settledReturnView(result, subject, this.stash);
          if (!view) return;
          settled = true;
          this.settle(view);
        },
        complete: () => {
          if (!settled) this.view.set(timedOutView(subject, last));
        },
      });
  }

  private readOnce(hostelId: string, subject: ReturnSubject): void {
    const kind = this.view().kind;
    if (kind === 'error' || kind === 'forbidden') {
      this.view.set({ kind: 'loading' });
    }
    this.request = this.api
      .billing(hostelId)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (billing) => {
          this.accept(hostelId, billing);
          this.settle(canceledReturnView(billing, subject, this.stash));
        },
        error: (err: ApiError) =>
          this.view.set(
            err?.status === 403 ? { kind: 'forbidden' } : { kind: 'error' },
          ),
      });
  }

  private accept(hostelId: string, billing: HostBilling): void {
    this.card = billing.saved_card;
    this.store.accept(hostelId, billing);
  }

  private settle(view: BillingReturnView): void {
    if (view.kind !== 'forbidden') this.checkout.clearReturn();
    this.view.set(view);
  }
}
