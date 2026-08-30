import { DropdownOption } from '@hostelhive/ui';
import {
  BACKPACKER,
  BILLING_CONFLICT_ERROR,
  conflicts,
  gateBillingOptions,
} from './billing-frequency';

const BILLING: DropdownOption[] = [
  { value: 'month', label: 'Per month' },
  { value: 'night', label: 'Per night' },
];

const find = (opts: DropdownOption[], v: string) => opts.find((o) => o.value === v);

/**
 * A backpacker hostel is sold by the night; a monthly hostel is not a backpacker hostel.
 *
 * Worth its own tests because the rule is enforced twice, once per dropdown, and the two
 * halves have to stay mirror images. Half of it working is the bad outcome: the host is
 * blocked one way round and free the other, and lands on the combination anyway.
 */
describe('gateBillingOptions', () => {
  it('disables monthly once the hostel is for backpackers', () => {
    const opts = gateBillingOptions(BILLING, BACKPACKER);

    expect(find(opts, 'month')?.disabled).toBe(true);
    expect(find(opts, 'month')?.disabledTooltip).toBeTruthy();
  });

  it('leaves nightly selectable', () => {
    const opts = gateBillingOptions(BILLING, BACKPACKER);

    expect(find(opts, 'night')?.disabled).toBeUndefined();
  });

  it('disables nothing for any other accommodation type', () => {
    for (const g of ['boys', 'girls', 'co-living', '']) {
      const opts = gateBillingOptions(BILLING, g);
      expect(opts.every((o) => !o.disabled)).toBe(true);
    }
  });

  // The options come from `GET /api/hostels/new`, so the caller's array is shared state.
  it('does not mutate the options it was given', () => {
    gateBillingOptions(BILLING, BACKPACKER);

    expect(BILLING.every((o) => o.disabled === undefined)).toBe(true);
  });
});

/**
 * The pair a hostel can only be in if it was saved before the rule existed — which the live
 * data is: `nHelLt` is backpacker and month-billed today.
 */
describe('conflicts', () => {
  it('is true only for backpacker on a monthly cycle', () => {
    expect(conflicts('backpacker', 'month')).toBe(true);
    expect(conflicts('backpacker', 'night')).toBe(false);
    expect(conflicts('boys', 'month')).toBe(false);
    expect(conflicts('co-living', 'night')).toBe(false);
  });

  it('is false while either half is still unset', () => {
    expect(conflicts('', 'month')).toBe(false);
    expect(conflicts('backpacker', '')).toBe(false);
    expect(conflicts('', '')).toBe(false);
  });

  // Accommodation stays freely choosable: the gate is one-directional, so a monthly hostel
  // can still say it is for backpackers — and is then told to move the cycle.
  it('leaves nightly as the way out', () => {
    expect(find(gateBillingOptions(BILLING, 'backpacker'), 'night')?.disabled).toBeUndefined();
  });

  it('names the fix rather than just the clash', () => {
    expect(BILLING_CONFLICT_ERROR).toMatch(/night/i);
  });
});
