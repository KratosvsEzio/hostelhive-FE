import type { AdminPlan } from '@hostelhive/data-access';
import {
  PLAN_PRICE_PATTERN,
  planDeactivates,
  planDraft,
  planIsDirty,
  planIsValid,
  planNameError,
  planPriceError,
  planUpdate,
} from './plan-edit';

const PLAN: AdminPlan = {
  id: 'pLn1',
  code: 'listing',
  name: 'Listing',
  active: true,
  position: 1,
  features: ['listing'],
  prices: { PKR: '5000.00' },
};

describe('plan edits', () => {
  it('shows the server values until a field is edited, and an absent price as empty', () => {
    expect(planDraft(PLAN, undefined)).toEqual({
      name: 'Listing',
      active: true,
      prices: { PKR: '5000.00', USD: '' },
    });
    expect(planDraft(PLAN, { prices: { USD: '18' } }).prices).toEqual({
      PKR: '5000.00',
      USD: '18',
    });
  });

  it.each([
    ['5000', true],
    ['5000.5', true],
    ['5000.50', true],
    ['0.01', true],
    ['999999999.99', true],
    ['1000000000', false],
    ['0', false],
    ['0.00', false],
    ['5000.505', false],
    ['5,000', false],
    ['-5', false],
    [' 18', false],
    ['1e3', false],
    ['.5', false],
  ])('the price pattern takes %j: %s', (value, ok) => {
    expect(PLAN_PRICE_PATTERN.test(value)).toBe(ok);
  });

  it('wants a trimmed name of 1 to 60 characters', () => {
    expect(planNameError('   ')).toBe('adminBilling.plans.nameRequired');
    expect(planNameError(` ${'a'.repeat(60)} `)).toBeNull();
    expect(planNameError('a'.repeat(61))).toBe(
      'adminBilling.plans.nameTooLong',
    );
  });

  it('refuses to clear a set price, checks a changed one, and leaves an untouched one alone', () => {
    const cleared = planDraft(PLAN, { prices: { PKR: '' } });
    expect(planPriceError(PLAN, cleared, 'PKR')).toBe(
      'adminBilling.plans.priceCannotClear',
    );

    const bad = planDraft(PLAN, { prices: { USD: '18.999' } });
    expect(planPriceError(PLAN, bad, 'USD')).toBe(
      'adminBilling.plans.priceInvalid',
    );
    expect(planIsValid(PLAN, bad)).toBe(false);

    const untouched = planDraft(PLAN, undefined);
    expect(planPriceError(PLAN, untouched, 'USD')).toBeNull();
    expect(planIsValid(PLAN, untouched)).toBe(true);
  });

  it('is dirty only when something differs from the server', () => {
    expect(planIsDirty(PLAN, planDraft(PLAN, { name: ' Listing ' }))).toBe(
      false,
    );
    expect(planIsDirty(PLAN, planDraft(PLAN, { prices: { PKR: '5000.00' } }))).toBe(false);
    expect(planIsDirty(PLAN, planDraft(PLAN, { prices: { PKR: '5000' } }))).toBe(true);
    expect(planIsDirty(PLAN, planDraft(PLAN, { active: false }))).toBe(true);
  });

  it('asks before turning a plan off, never before turning one on', () => {
    expect(planDeactivates(PLAN, planDraft(PLAN, { active: false }))).toBe(true);
    const off = { ...PLAN, active: false };
    expect(planDeactivates(off, planDraft(off, { active: true }))).toBe(false);
  });

  it('sends the trimmed name, the active flag and only the changed prices as typed', () => {
    expect(
      planUpdate(
        PLAN,
        planDraft(PLAN, { name: '  Basic ', prices: { USD: '18' } }),
      ),
    ).toEqual({ plan: { name: 'Basic', active: true }, prices: { USD: '18' } });

    expect(planUpdate(PLAN, planDraft(PLAN, { active: false }))).toEqual({
      plan: { name: 'Listing', active: false },
    });
  });
});
