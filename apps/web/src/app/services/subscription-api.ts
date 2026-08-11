import { Injectable, inject } from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { Observable, of, throwError } from 'rxjs';
import { catchError, delay, map } from 'rxjs/operators';
import { ApiClient } from '@core/api-resource';
import { CURRENT_CONTRACT, PLANS } from './subscription.fixtures';
import {
  BillingCycle,
  SubscriptionContract as Contract,
  SubscriptionContractStatus as ContractStatus,
  SubscriptionPayment as Payment,
  SubscriptionPlan,
} from '@hostelhive/data-access';

interface ApiContractStatus {
  id?: string | null;
  name?: string | null;
  slug?: string | null;
}

interface ApiContractPayment {
  id?: string | null;
  amount?: string | number | null;
  products?: Array<{ id?: number | null; name?: string | null }> | null;
}

interface ApiContract {
  id?: string | null;
  contract_type?: string | null;
  start_date?: string | null;
  end_date?: string | null;
  price?: string | number | null;
  status?: ApiContractStatus | null;
  payment?: ApiContractPayment | null;
}

interface ApiCurrentSubscriptionResponse {
  subscription?: { active_until?: string | null; featured_until?: string | null } | null;
  contracts?: ApiContract[] | null;
  success?: boolean;
}

interface ApiPaymentStatus {
  id?: string;
  name?: string;
  slug?: string;
}

interface ApiPayment {
  id?: string;
  amount?: number;
  payment_method?: string | null;
  created_at?: string;
  paid_at?: string | null;
  status?: ApiPaymentStatus;
  products?: Array<{ id?: string; name?: string; price?: number; product_type?: string }> | null;
}

interface ApiPaymentsResponse {
  payments?: ApiPayment[];
  success?: boolean;
}

const PAYMENT_STATUS_MAP: Record<string, Payment['status']> = {
  verified: 'paid',
  pending: 'pending',
  rejected: 'failed',
  refunded: 'refunded',
};

const CONTRACT_STATUS_MAP: Partial<Record<string, ContractStatus>> = {
  active: 'active',
  expired: 'expired',
  cancelled: 'cancelled',
  pending: 'pending-payment',
  draft: 'draft',
};

function inferCycle(start?: string | null, end?: string | null): BillingCycle {
  if (!start || !end) return 'monthly';
  const days = (new Date(end).getTime() - new Date(start).getTime()) / 86_400_000;
  return days >= 300 ? 'annual' : 'monthly';
}

/** Allowed transitions for the contract state machine. */
const TRANSITIONS: Record<ContractStatus, ContractStatus[]> = {
  draft: ['pending-payment'],
  'pending-payment': ['active', 'draft'], // webhook success → active; fail/timeout → draft
  active: ['expired', 'cancelled', 'pending-payment'], // lapse, cancel, or renew/upgrade
  expired: ['pending-payment'], // re-subscribe
  cancelled: ['pending-payment'], // re-subscribe
};

export function canTransition(
  from: ContractStatus,
  to: ContractStatus,
): boolean {
  return TRANSITIONS[from].includes(to);
}

const ONE_DAY = 86_400_000;

/**
 * Subscription API. **Stub pending Q-API (§0)** — backed by in-memory fixtures with a
 * small delay to exercise loading states. The instance holds the *single source of
 * truth* for the current contract so `checkout()` → `activate()` transitions persist
 * across calls; when the typed SDK lands, swap the `of(...)` bodies for HTTP calls and
 * move the state machine server-side. Public shape stays the same.
 */
@Injectable({ providedIn: 'root' })
export class SubscriptionApi {
  private readonly apiClient = inject(ApiClient);

  /** Live contract state — mutated by checkout / webhook / renew / cancel. */
  private contract: Contract = { ...CURRENT_CONTRACT };

  plans(): Observable<SubscriptionPlan[]> {
    return of(PLANS).pipe(delay(150));
  }

  /**
   * Fetches the live subscription from GET /api/hostels/:hostelId/current_subscription.
   * Returns null when the hostel has no active plan (404 or empty response).
   */
  currentSubscription(hostelId: string): Observable<{ contract: Contract | null; featuredUntil: string | null }> {
    return this.apiClient
      .get<ApiCurrentSubscriptionResponse>(`/api/hostels/${hostelId}/current_subscription`)
      .pipe(
        map((res) => {
          const contracts = res.contracts ?? [];
          const c = contracts.find((x) => x.status?.slug === 'active') ?? contracts[0];
          const featuredUntil = res.subscription?.featured_until ?? null;

          if (!c?.id) return { contract: null, featuredUntil };
          const product = c.payment?.products?.[0];

          const activeUntil = res.subscription?.active_until ?? null;
          let status: ContractStatus =
            (CONTRACT_STATUS_MAP[c.status?.slug ?? ''] ?? 'draft') as ContractStatus;
          if (activeUntil && new Date(activeUntil).getTime() < Date.now()) {
            status = 'expired';
          }

          return {
            contract: {
              id: String(c.id),
              planId: product?.id != null ? String(product.id) : '',
              status,
              cycle: inferCycle(c.start_date, c.end_date),
              amount: Number(c.price ?? c.payment?.amount ?? 0),
              startedAt: c.start_date ?? null,
              renewsAt: activeUntil ?? c.end_date ?? null,
              autoRenew: false,
              propertiesUsed: 0,
            } satisfies Contract,
            featuredUntil,
          };
        }),
        catchError((err: HttpErrorResponse) => {
          if (err.status === 404) return of({ contract: null, featuredUntil: null });
          return throwError(() => err);
        }),
      );
  }

  paymentHistory(hostelId: string): Observable<Payment[]> {
    return this.apiClient
      .get<ApiPaymentsResponse>(`/api/host/hostels/${hostelId}/payments`)
      .pipe(
        map((res) =>
          (res.payments ?? []).map((p): Payment => {
            const products = (p.products ?? []).map((pr, i) => ({
              id: pr.id ?? String(i),
              name: pr.name ?? 'Product',
              price: pr.price ?? 0,
            }));
            return {
              id: p.id ?? '',
              date: p.paid_at ?? p.created_at ?? '',
              description: products[0]?.name ?? 'Subscription',
              products,
              method: p.payment_method ?? 'Online',
              status: PAYMENT_STATUS_MAP[p.status?.slug ?? ''] ?? 'pending',
              amount: p.amount ?? 0,
              receiptUrl: null,
            };
          }),
        ),
      );
  }

  /**
   * Begin checkout for `planId`: transitions the contract into `pending-payment`
   * (from `draft`, `expired`, `cancelled`, or `active` for an upgrade) and records a
   * pending payment row. A real impl would return a hosted-checkout URL here.
   */
  checkout(
    planId: string,
    cycle: 'monthly' | 'annual' = 'annual',
  ): Observable<Contract> {
    const plan = PLANS.find((p) => p.id === planId);
    if (!plan || plan.custom || plan.price === null) {
      return throwError(
        () => new Error('Plan is not available for self-serve checkout'),
      );
    }
    if (!canTransition(this.contract.status, 'pending-payment')) {
      return throwError(
        () => new Error(`Cannot start checkout from "${this.contract.status}"`),
      );
    }

    const amount = cycle === 'annual' ? plan.price * 12 : plan.price;
    this.contract = {
      ...this.contract,
      planId,
      status: 'pending-payment',
      cycle,
      amount,
    };
    return of({ ...this.contract }).pipe(delay(150));
  }

  /**
   * Simulate the payment-gateway **webhook** confirming the charge:
   * `pending-payment` → `active`. Marks the pending payment row as paid and sets the
   * renewal window. The `delay` mimics the gateway's out-of-band callback latency.
   */
  activate(): Observable<Contract> {
    if (!canTransition(this.contract.status, 'active')) {
      return throwError(
        () =>
          new Error(`No payment is pending (status "${this.contract.status}")`),
      );
    }
    const now = new Date();
    const period = this.contract.cycle === 'annual' ? 365 : 30;
    this.contract = {
      ...this.contract,
      status: 'active',
      startedAt: now.toISOString().slice(0, 10),
      renewsAt: new Date(now.getTime() + period * ONE_DAY)
        .toISOString()
        .slice(0, 10),
    };
    // ~1.2s to feel like a real async gateway callback.
    return of({ ...this.contract }).pipe(delay(1200));
  }

  /** Renew an active/expired contract — also runs through `pending-payment`. */
  renew(): Observable<Contract> {
    return this.checkout(this.contract.planId, this.contract.cycle);
  }

  /** Cancel an active contract → `cancelled`. */
  cancel(): Observable<Contract> {
    if (!canTransition(this.contract.status, 'cancelled')) {
      return throwError(
        () => new Error(`Cannot cancel from "${this.contract.status}"`),
      );
    }
    this.contract = { ...this.contract, status: 'cancelled', autoRenew: false };
    return of({ ...this.contract }).pipe(delay(150));
  }

  /** POST /api/hostels/:hostelId/orders — creates an order for one or more products. */
  createOrder(hostelId: string, productIds: number[]): Observable<unknown> {
    return this.apiClient.post(`/api/hostels/${hostelId}/orders`, {
      order: { product_ids: productIds },
    });
  }
}
