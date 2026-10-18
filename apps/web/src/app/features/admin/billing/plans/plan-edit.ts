import type {
  AdminCurrency,
  AdminPlan,
  AdminPlanUpdate,
} from '@hostelhive/data-access';

/** The currencies a plan is priced in, in the order the editor shows them. */
export const PLAN_CURRENCIES: readonly AdminCurrency[] = ['PKR', 'USD'];

/** Up to nine whole digits and two decimals, and not all zeros. A pattern only; never parsed. */
export const PLAN_PRICE_PATTERN = /^(?=.*[1-9])\d{1,9}(\.\d{1,2})?$/;

export const PLAN_NAME_MAX = 60;

export type PlanNameError =
  | 'adminBilling.plans.nameRequired'
  | 'adminBilling.plans.nameTooLong';

export type PlanPriceError =
  | 'adminBilling.plans.priceInvalid'
  | 'adminBilling.plans.priceCannotClear';

/** What the admin has changed on one plan; a field left out shows the server's value. */
export interface PlanEdits {
  name?: string;
  active?: boolean;
  prices?: Partial<Record<AdminCurrency, string>>;
}

/** One plan as the editor shows it: the server's values with the admin's edits laid over them. */
export interface PlanDraft {
  name: string;
  active: boolean;
  prices: Record<AdminCurrency, string>;
}

export function planDraft(
  plan: AdminPlan,
  edits: PlanEdits | undefined,
): PlanDraft {
  return {
    name: edits?.name ?? plan.name,
    active: edits?.active ?? plan.active,
    prices: {
      PKR: edits?.prices?.PKR ?? plan.prices.PKR ?? '',
      USD: edits?.prices?.USD ?? plan.prices.USD ?? '',
    },
  };
}

export function planNameError(name: string): PlanNameError | null {
  const trimmed = name.trim();
  if (!trimmed) return 'adminBilling.plans.nameRequired';
  if (trimmed.length > PLAN_NAME_MAX) return 'adminBilling.plans.nameTooLong';
  return null;
}

function priceChanged(
  plan: AdminPlan,
  draft: PlanDraft,
  currency: AdminCurrency,
): boolean {
  return draft.prices[currency] !== (plan.prices[currency] ?? '');
}

/** Only a price the admin changed is checked, because only a changed price is sent. */
export function planPriceError(
  plan: AdminPlan,
  draft: PlanDraft,
  currency: AdminCurrency,
): PlanPriceError | null {
  if (!priceChanged(plan, draft, currency)) return null;
  const value = draft.prices[currency];
  // The backend has no way to remove a price, so emptying a set one cannot be saved.
  if (value === '') return 'adminBilling.plans.priceCannotClear';
  return PLAN_PRICE_PATTERN.test(value)
    ? null
    : 'adminBilling.plans.priceInvalid';
}

export function planIsValid(plan: AdminPlan, draft: PlanDraft): boolean {
  return (
    planNameError(draft.name) === null &&
    PLAN_CURRENCIES.every((c) => planPriceError(plan, draft, c) === null)
  );
}

export function planIsDirty(plan: AdminPlan, draft: PlanDraft): boolean {
  return (
    draft.name.trim() !== plan.name ||
    draft.active !== plan.active ||
    PLAN_CURRENCIES.some((c) => priceChanged(plan, draft, c))
  );
}

/** Turning off a plan that is on; turning one back on asks nothing. */
export function planDeactivates(plan: AdminPlan, draft: PlanDraft): boolean {
  return plan.active && !draft.active;
}

/** Name and active always; a price only when its string changed, sent exactly as typed. */
export function planUpdate(plan: AdminPlan, draft: PlanDraft): AdminPlanUpdate {
  const body: AdminPlanUpdate = {
    plan: { name: draft.name.trim(), active: draft.active },
  };
  const prices: Partial<Record<AdminCurrency, string>> = {};
  for (const currency of PLAN_CURRENCIES) {
    if (priceChanged(plan, draft, currency)) {
      prices[currency] = draft.prices[currency];
    }
  }
  if (Object.keys(prices).length) body.prices = prices;
  return body;
}
