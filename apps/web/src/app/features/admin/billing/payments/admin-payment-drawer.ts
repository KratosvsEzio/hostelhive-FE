import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
  effect,
  inject,
  input,
  output,
  signal,
  untracked,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { Observable, Subscription } from 'rxjs';
import type {
  AdminPaymentDetail,
  AdminPaymentRow,
} from '@hostelhive/data-access';
import {
  Button,
  ConfirmModal,
  Drawer,
  ErrorState,
  Skeleton,
  StatusPill,
} from '@hostelhive/ui';
import { AdminBillingApi } from '@services';
import { LocaleLink } from '@core/i18n/locale-link';
import { AdminUtcDate } from '../shared/admin-utc-date';
import { billingPaymentStatusTone } from '@app/shared/billing/billing-labels';
import { BillingMoneyPipe } from '@app/shared/billing/billing-money.pipe';
import { InvoiceSummary } from '@features/host/subscription/invoice-summary';
import {
  type AdminBillingError,
  adminBillingError,
} from '../shared/admin-billing-errors';
import {
  ADMIN_BILLING_PATHS,
  type AdminHostelState,
  adminHostelBillingPath,
  adminPaymentMethodKey,
  adminPaymentNeedsRefund,
  adminPaymentStatusKey,
  isolate,
} from '../shared/admin-billing-labels';
import { AdminPaymentAttempts } from '../shared/admin-payment-attempts';
import { ADMIN_BILLING_DATE_TIME } from '../shared/admin-billing-cell-format';

/** What happened to a payment the admin acted on, for the list behind the drawer. */
export interface AdminPaymentOutcome {
  paymentId: string;
  /** `stale` is a 422 or 404: someone else changed the payment first. */
  result: 'verified' | 'not-applied' | 'rejected' | 'stale';
  detail: AdminPaymentDetail | null;
}

type DetailView =
  | { kind: 'loading' }
  | { kind: 'error'; error: AdminBillingError }
  | { kind: 'ready'; detail: AdminPaymentDetail };

type Dialog = 'verify' | 'reject' | null;

/** The longest rejection reason the host is emailed. */
export const REJECT_REASON_MAX = 500;

const AWAITING = 'awaiting-verification';

/** Instance counter behind the reason field's id. */
let drawers = 0;

/**
 * One payment as an admin reviews it: its fields, the proof, the invoice it pays and the
 * invoice's other attempts, with Verify and Reject while it awaits verification.
 *
 * The list row supplies the hostel, because the payment detail does not carry one. The detail
 * is fetched on open so the proof link is fresh.
 *
 * Verify's outcome is read from the returned payment's status, never from the HTTP status: a
 * transfer that does not match its invoice comes back 200 and failed. One action runs at a
 * time, and the drawer cannot be closed while it does.
 *
 * `<hh-admin-payment-drawer [row]="row" (closed)="close()" (handled)="onHandled($event)" />`
 */
@Component({
  selector: 'hh-admin-payment-drawer',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    Drawer,
    ConfirmModal,
    Button,
    ErrorState,
    Skeleton,
    StatusPill,
    RouterLink,
    LocaleLink,
    TranslocoPipe,
    AdminUtcDate,
    BillingMoneyPipe,
    InvoiceSummary,
    AdminPaymentAttempts,
  ],
  template: `
    <hh-drawer
      [heading]="
        'adminBilling.invoices.title' | transloco: { number: invoiceNumber() }
      "
      widthClass="max-w-xl"
      (closed)="requestClose()"
    >
      <div class="flex flex-col gap-5" data-testid="payment-drawer">
        <div class="flex flex-wrap items-center justify-between gap-3">
          <p
            class="font-display text-2xl font-bold text-ink-900"
            data-field="amount"
          >
            <bdi>{{ amount() | billingMoney: currency() }}</bdi>
          </p>
          <div class="flex flex-wrap items-center gap-2">
            <hh-status-pill [tone]="statusTone()" data-field="status">
              @if (statusKey(); as key) {
                {{ key | transloco }}
              } @else {
                {{ statusName() }}
              }
            </hh-status-pill>
            @if (needsRefund()) {
              <hh-status-pill tone="danger" data-field="refund-badge">{{
                'adminBilling.refund.badge' | transloco
              }}</hh-status-pill>
            }
          </div>
        </div>

        @if (notApplied(); as reason) {
          <div
            class="rounded-xl bg-danger/10 px-4 py-3 text-sm text-danger"
            role="alert"
            data-testid="not-applied"
          >
            <p class="font-semibold">
              {{
                'adminBilling.verification.verifyNotApplied'
                  | transloco: { reason: reason }
              }}
            </p>
            <p class="mt-1">
              {{ 'adminBilling.verification.verifyNotAppliedNext' | transloco }}
            </p>
          </div>
        }

        @if (actionError(); as error) {
          <p
            class="rounded-xl bg-danger/10 px-4 py-3 text-sm font-medium text-danger"
            role="alert"
            data-testid="action-error"
          >
            {{ error.message ?? (error.key | transloco) }}
          </p>
        }

        @if (needsRefund()) {
          <p
            class="rounded-xl bg-danger/10 px-4 py-3 text-sm font-medium text-danger"
            role="note"
            data-testid="refund-note"
          >
            {{ 'adminBilling.refund.body' | transloco: { tracker: tracker() ?? '—' } }}
          </p>
        }

        <dl
          class="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 rounded-2xl border border-ink-100 p-4 text-sm"
        >
          <dt class="text-ink-500">
            {{ 'adminBilling.columns.hostel' | transloco }}
          </dt>
          <dd class="min-w-0 text-ink-900" data-field="hostel">
            @if (hostel(); as h) {
              <a
                class="font-medium text-brand-500 hover:underline"
                [routerLink]="hostelPath()"
                [state]="h"
                data-testid="hostel-link"
                >{{ h.hostel.name }}</a
              >
            } @else {
              —
            }
          </dd>

          <dt class="text-ink-500">
            {{ 'adminBilling.columns.invoice' | transloco }}
          </dt>
          <dd class="min-w-0 text-ink-900" data-field="invoice">
            @if (invoiceId(); as id) {
              <a
                class="font-medium text-brand-500 hover:underline"
                [routerLink]="paths.invoices"
                [queryParams]="{ invoice: id }"
                data-testid="invoice-link"
                >{{ invoiceNumber() }}</a
              >
            } @else {
              {{ invoiceNumber() }}
            }
          </dd>

          @if (planName(); as plan) {
            <dt class="text-ink-500">
              {{ 'adminBilling.columns.plan' | transloco }}
            </dt>
            <dd class="text-ink-900" data-field="plan">{{ plan }}</dd>
          }

          <dt class="text-ink-500">
            {{ 'adminBilling.columns.method' | transloco }}
          </dt>
          <dd class="text-ink-900" data-field="method">
            {{ methodKey() | transloco }}
          </dd>

          <dt class="text-ink-500">
            {{ 'adminBilling.columns.reference' | transloco }}
          </dt>
          <dd class="break-all text-ink-900" data-field="reference">
            {{ reference() ?? '—' }}
          </dd>

          @if (tracker(); as value) {
            <dt class="text-ink-500">
              {{ 'adminBilling.columns.tracker' | transloco }}
            </dt>
            <dd
              class="select-all break-all font-mono text-xs text-ink-900"
              data-field="tracker"
            >
              {{ value }}
            </dd>
          }

          <dt class="text-ink-500">
            {{ 'adminBilling.columns.submitted' | transloco }}
          </dt>
          <dd class="text-ink-900" data-field="submitted">
            {{ createdAt() | adminUtcDate: dateTime }}
          </dd>

          @if (succeededAt(); as value) {
            <dt class="text-ink-500">
              {{ 'adminBilling.columns.succeeded' | transloco }}
            </dt>
            <dd class="text-ink-900" data-field="succeeded">
              {{ value | adminUtcDate: dateTime }}
            </dd>
          }

          @if (verifiedAt(); as value) {
            <dt class="text-ink-500">
              {{ 'adminBilling.fields.verifiedAt' | transloco }}
            </dt>
            <dd class="text-ink-900" data-field="verified-at">
              {{ value | adminUtcDate: dateTime }}
            </dd>
          }

          @if (verifiedBy(); as name) {
            <dt class="text-ink-500">
              {{ 'adminBilling.fields.verifiedBy' | transloco }}
            </dt>
            <dd class="text-ink-900" data-field="verified-by">{{ name }}</dd>
          }

          @if (failureReason(); as reason) {
            <dt class="text-ink-500">
              {{ 'adminBilling.fields.failureReason' | transloco }}
            </dt>
            <dd class="break-words text-ink-900" data-field="failure-reason">
              {{ reason }}
            </dd>
          }

          @if (detail(); as d) {
            <dt class="text-ink-500">
              {{ 'adminBilling.fields.proof' | transloco }}
            </dt>
            <dd class="text-ink-900" data-field="proof">
              @if (d.payment.proof_url; as url) {
                <a
                  class="inline-flex items-center gap-1 font-medium text-brand-500 hover:underline"
                  [href]="url"
                  target="_blank"
                  rel="noopener noreferrer"
                  data-testid="proof-link"
                  ><i class="ti ti-external-link" aria-hidden="true"></i
                  >{{ 'adminBilling.common.proofView' | transloco }}</a
                >
              } @else {
                <span class="text-ink-500" data-testid="proof-none">{{
                  'adminBilling.common.proofNone' | transloco
                }}</span>
              }
            </dd>
          }
        </dl>

        <p class="text-xs text-ink-400">
          {{ 'adminBilling.common.datesUtc' | transloco }}
        </p>

        @switch (view().kind) {
          @case ('loading') {
            <div class="flex flex-col gap-3" aria-busy="true" data-testid="detail-loading">
              <hh-skeleton class="h-40 w-full" radius="lg" />
              <hh-skeleton class="h-24 w-full" radius="lg" />
            </div>
          }
          @case ('error') {
            @if (loadForbidden()) {
              <p
                class="rounded-xl bg-ink-50 px-4 py-3 text-sm text-ink-700"
                data-testid="detail-forbidden"
              >
                {{ 'adminBilling.errors.forbidden' | transloco }}
              </p>
            } @else if (loadNotFound()) {
              <p
                class="rounded-xl bg-ink-50 px-4 py-3 text-sm text-ink-700"
                data-testid="detail-not-found"
              >
                {{ 'adminBilling.errors.notFound' | transloco }}
              </p>
            } @else {
              <hh-error-state
                [message]="'adminBilling.common.loadError' | transloco"
                [retryLabel]="'adminBilling.common.retry' | transloco"
                [networkError]="loadNetworkError()"
                (retry)="reload()"
                data-testid="detail-error"
              />
            }
          }
          @case ('ready') {
            @if (detail(); as d) {
              <hh-invoice-summary [invoice]="d.invoice" />
              <hh-admin-payment-attempts
                [payments]="d.invoice.payments"
                [excludeId]="d.payment.id"
              />
            }
          }
        }
      </div>

      <ng-container footer>
        @if (canAct()) {
          <button
            hh-button
            variant="outlined"
            color="danger"
            [disabled]="busy()"
            (click)="openReject()"
            data-testid="reject"
          >
            {{ 'adminBilling.verification.reject' | transloco }}
          </button>
          <button
            hh-button
            color="primary"
            [disabled]="busy()"
            [loading]="busy()"
            (click)="openVerify()"
            data-testid="verify"
          >
            {{ 'adminBilling.verification.verify' | transloco }}
          </button>
        } @else {
          <button
            hh-button
            variant="outlined"
            [disabled]="busy()"
            (click)="requestClose()"
            data-testid="close"
          >
            {{ 'adminBilling.common.close' | transloco }}
          </button>
        }
      </ng-container>

    <!-- Projected into the drawer so the dialogs stack above its panel. -->
    @if (dialog() === 'verify') {
      <hh-confirm-modal
        [title]="'adminBilling.verification.verifyTitle' | transloco"
        icon="ti-building-bank"
        tone="info"
        [confirmLabel]="'adminBilling.verification.verifyConfirm' | transloco"
        [cancelLabel]="'adminBilling.common.cancel' | transloco"
        confirmColor="primary"
        (confirm)="verify()"
        (cancel)="closeDialog()"
        data-testid="verify-dialog"
      >
        @if (reference(); as ref) {
          {{
            'adminBilling.verification.verifyMessage'
              | transloco
                : {
                    amount: isolatedAmount(),
                    reference: ref,
                    number: invoiceNumber(),
                  }
          }}
        } @else {
          {{
            'adminBilling.verification.verifyMessageNoReference'
              | transloco
                : { amount: isolatedAmount(), number: invoiceNumber() }
          }}
        }
      </hh-confirm-modal>
    }

    @if (dialog() === 'reject') {
      <hh-confirm-modal
        [title]="'adminBilling.verification.rejectTitle' | transloco"
        icon="ti-ban"
        tone="danger"
        size="md"
        [confirmLabel]="'adminBilling.verification.rejectConfirm' | transloco"
        [cancelLabel]="'adminBilling.common.cancel' | transloco"
        confirmColor="danger"
        [confirmDisabled]="!reasonValid()"
        (confirm)="reject()"
        (cancel)="closeDialog()"
        data-testid="reject-dialog"
      >
        <p class="mb-3">
          {{ 'adminBilling.verification.rejectHint' | transloco }}
        </p>
        <label
          class="mb-1 block text-xs font-medium text-ink-600"
          [for]="reasonId"
        >
          {{ 'adminBilling.verification.rejectReasonLabel' | transloco }}
          <span class="text-danger" aria-hidden="true">*</span>
        </label>
        <textarea
          [id]="reasonId"
          rows="4"
          required
          class="w-full resize-none rounded-xl border border-ink-200 px-3 py-2 text-sm text-ink-900 outline-none transition placeholder:text-ink-400 focus:border-brand-400 focus:ring-2 focus:ring-brand-100"
          [value]="reason()"
          (input)="onReason($any($event.target).value)"
          [attr.aria-invalid]="reasonProblem() ? 'true' : null"
          [attr.aria-describedby]="reasonProblem() ? reasonId + '-error' : null"
          data-testid="reject-reason"
        ></textarea>
        @if (reasonProblem(); as problem) {
          <p
            [id]="reasonId + '-error'"
            class="mt-1 text-xs font-medium text-danger"
            data-testid="reject-reason-error"
          >
            @if (problem === 'tooLong') {
              {{ 'adminBilling.verification.rejectReasonTooLong' | transloco }}
            } @else {
              {{ 'adminBilling.verification.rejectReasonRequired' | transloco }}
            }
          </p>
        }
      </hh-confirm-modal>
    }
    </hh-drawer>
  `,
})
export class AdminPaymentDrawer {
  private readonly api = inject(AdminBillingApi);
  private readonly destroyRef = inject(DestroyRef);

  /** The list row that was opened; it is the only source of the hostel. */
  readonly row = input.required<AdminPaymentRow>();
  /** The drawer asked to close; the page decides. */
  readonly closed = output<void>();
  readonly handled = output<AdminPaymentOutcome>();

  protected readonly paths = ADMIN_BILLING_PATHS;
  protected readonly dateTime = ADMIN_BILLING_DATE_TIME;
  protected readonly reasonId = `hh-reject-reason-${++drawers}`;

  protected readonly view = signal<DetailView>({ kind: 'loading' });
  protected readonly busy = signal(false);
  protected readonly dialog = signal<Dialog>(null);
  protected readonly reason = signal('');
  private readonly reasonTouched = signal(false);
  protected readonly actionError = signal<AdminBillingError | null>(null);
  /** The server's failure reason after a Verify that did not apply. */
  protected readonly notApplied = signal<string | null>(null);

  private readonly money = new BillingMoneyPipe();
  private loading?: Subscription;

  protected readonly detail = computed(() => {
    const v = this.view();
    return v.kind === 'ready' ? v.detail : null;
  });

  // The detail is fresher than the row, so every shared field prefers it.
  private readonly payment = computed(() => this.detail()?.payment ?? null);

  protected readonly amount = computed(
    () => this.payment()?.amount ?? this.row().amount,
  );
  protected readonly currency = computed(
    () => this.payment()?.currency ?? this.row().currency,
  );
  private readonly statusSlug = computed(
    () => (this.payment() ?? this.row()).status?.slug ?? null,
  );
  protected readonly statusKey = computed(() =>
    adminPaymentStatusKey(this.statusSlug()),
  );
  protected readonly statusName = computed(
    () => (this.payment() ?? this.row()).status?.name ?? '—',
  );
  protected readonly statusTone = computed(() =>
    billingPaymentStatusTone(this.statusSlug()),
  );
  protected readonly needsRefund = computed(() =>
    adminPaymentNeedsRefund(this.payment() ?? this.row()),
  );
  protected readonly methodKey = computed(() =>
    adminPaymentMethodKey(
      this.payment()?.payment_method ?? this.row().payment_method,
    ),
  );
  protected readonly reference = computed(
    () => (this.payment() ?? this.row()).reference || null,
  );
  protected readonly tracker = computed(
    () => (this.payment() ?? this.row()).gateway_reference || null,
  );
  protected readonly failureReason = computed(
    () => (this.payment() ?? this.row()).failure_reason || null,
  );
  protected readonly createdAt = computed(
    () => this.payment()?.created_at ?? this.row().created_at,
  );
  protected readonly succeededAt = computed(
    () => (this.payment() ?? this.row()).succeeded_at,
  );
  protected readonly verifiedAt = computed(
    () => (this.payment() ?? this.row()).verified_at,
  );
  protected readonly verifiedBy = computed(
    () => this.row().verified_by?.name ?? null,
  );
  protected readonly invoiceId = computed(
    () => this.detail()?.invoice.id ?? this.row().invoice?.id ?? null,
  );
  protected readonly invoiceNumber = computed(
    () => this.detail()?.invoice.number ?? this.row().invoice?.number ?? '—',
  );
  protected readonly planName = computed(
    () =>
      this.detail()?.invoice.plan?.name ?? this.row().invoice?.plan?.name ?? null,
  );

  /** The router state the hostel page reads its name from. */
  protected readonly hostel = computed<AdminHostelState | null>(() => {
    const row = this.row();
    const id = row.hostel?.id ?? row.hostel_id;
    const name = row.hostel?.name;
    return id && name ? { hostel: { id, name } } : null;
  });
  protected readonly hostelPath = computed(() => {
    const h = this.hostel();
    return h ? adminHostelBillingPath(h.hostel.id) : null;
  });

  protected readonly canAct = computed(
    () => this.detail() !== null && this.statusSlug() === AWAITING,
  );

  protected readonly isolatedAmount = computed(() =>
    isolate(this.money.transform(this.amount(), this.currency())),
  );

  private readonly trimmedReason = computed(() => this.reason().trim());
  protected readonly reasonValid = computed(() => {
    const length = this.trimmedReason().length;
    return length > 0 && length <= REJECT_REASON_MAX && !this.busy();
  });
  protected readonly reasonProblem = computed<'required' | 'tooLong' | null>(
    () => {
      const length = this.trimmedReason().length;
      if (length > REJECT_REASON_MAX) return 'tooLong';
      return length === 0 && this.reasonTouched() ? 'required' : null;
    },
  );

  protected readonly loadForbidden = computed(() => {
    const v = this.view();
    return v.kind === 'error' && v.error.kind === 'forbidden';
  });
  protected readonly loadNotFound = computed(() => {
    const v = this.view();
    return v.kind === 'error' && v.error.kind === 'notFound';
  });
  protected readonly loadNetworkError = computed(() => {
    const v = this.view();
    return v.kind === 'error' && v.error.kind === 'network';
  });

  constructor() {
    effect(() => {
      const id = this.row().id;
      untracked(() => this.open(id));
    });
    this.destroyRef.onDestroy(() => this.loading?.unsubscribe());
  }

  protected reload(): void {
    this.load(this.row().id);
  }

  protected requestClose(): void {
    if (this.busy()) return;
    // Escape inside an open dialog reaches the drawer too; it dismisses the dialog first.
    if (this.dialog()) {
      this.dialog.set(null);
      return;
    }
    this.closed.emit();
  }

  protected openVerify(): void {
    if (!this.canAct() || this.busy()) return;
    this.actionError.set(null);
    this.dialog.set('verify');
  }

  protected openReject(): void {
    if (!this.canAct() || this.busy()) return;
    this.actionError.set(null);
    this.reason.set('');
    this.reasonTouched.set(false);
    this.dialog.set('reject');
  }

  protected closeDialog(): void {
    if (this.busy()) return;
    this.dialog.set(null);
  }

  protected onReason(value: string): void {
    this.reason.set(value);
    this.reasonTouched.set(true);
  }

  protected verify(): void {
    if (this.busy()) return;
    const id = this.row().id;
    this.dialog.set(null);
    this.run(this.api.verify(id), (detail) => {
      const slug = detail.payment.status?.slug;
      this.view.set({ kind: 'ready', detail });
      if (slug === 'succeeded') {
        this.handled.emit({ paymentId: id, result: 'verified', detail });
      } else if (slug === 'failed') {
        this.notApplied.set(detail.payment.failure_reason ?? '');
        this.handled.emit({ paymentId: id, result: 'not-applied', detail });
      } else {
        this.load(id);
      }
    });
  }

  protected reject(): void {
    if (!this.reasonValid()) return;
    const id = this.row().id;
    const reason = this.trimmedReason();
    this.dialog.set(null);
    this.run(this.api.reject(id, reason), (detail) => {
      this.view.set({ kind: 'ready', detail });
      this.handled.emit({ paymentId: id, result: 'rejected', detail });
    });
  }

  private open(id: string): void {
    this.dialog.set(null);
    this.actionError.set(null);
    this.notApplied.set(null);
    this.load(id);
  }

  /** `announceGone` is false when the caller has already reported the payment stale. */
  private load(id: string, announceGone = true): void {
    this.loading?.unsubscribe();
    this.view.set({ kind: 'loading' });
    this.loading = this.api.payment(id).subscribe({
      next: (detail) => this.view.set({ kind: 'ready', detail }),
      error: (err: unknown) => {
        const error = adminBillingError(err);
        this.view.set({ kind: 'error', error });
        if (error.kind !== 'notFound') return;
        // The detail now says the payment is gone, so an action's identical message would repeat it.
        if (this.actionError()?.kind === 'notFound') this.actionError.set(null);
        if (announceGone) {
          this.handled.emit({ paymentId: id, result: 'stale', detail: null });
        }
      },
    });
  }

  private run(
    request: Observable<AdminPaymentDetail>,
    done: (detail: AdminPaymentDetail) => void,
  ): void {
    const id = this.row().id;
    this.busy.set(true);
    this.actionError.set(null);
    request.pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: (detail) => {
        this.busy.set(false);
        done(detail);
      },
      error: (err: unknown) => {
        this.busy.set(false);
        const error = adminBillingError(err);
        this.actionError.set(error);
        // Someone else changed this payment first: show what the server said, then catch up.
        if (error.kind === 'server' || error.kind === 'notFound') {
          this.handled.emit({ paymentId: id, result: 'stale', detail: null });
          this.load(id, false);
        }
      },
    });
  }
}
