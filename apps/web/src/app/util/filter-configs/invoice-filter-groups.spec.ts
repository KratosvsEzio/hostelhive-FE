import { FilterOption } from '@hostelhive/ui';
import { invoiceFilterGroups } from './invoice-filter-groups';

const STATUS: FilterOption[] = [
  { value: 'due', label: 'Due' },
  { value: 'paid', label: 'Paid' },
];
const BASE_URL = 'http://api.test';

describe('invoiceFilterGroups', () => {
  describe('billing renters (default)', () => {
    const groups = invoiceFilterGroups('h1', STATUS, BASE_URL);

    it('keeps every group in order', () => {
      expect(groups.map((g) => g.key)).toEqual(['status', 'kind', 'room', 'tenant', 'date']);
    });

    it('offers rental and utility as the bill types, with no booking', () => {
      const kind = groups.find((g) => g.key === 'kind')!;
      const values = (kind.fields![0] as { options: FilterOption[] }).options.map((o) => o.value);

      expect(values).toEqual(['all', 'rental', 'utility']);
    });

    it('prefixes the status options with All', () => {
      const status = groups.find((g) => g.key === 'status')!;
      const values = (status.fields![0] as { options: FilterOption[] }).options.map((o) => o.value);

      expect(values).toEqual(['all', 'due', 'paid']);
    });

    it('scopes the tenant lookup to the hostel', () => {
      const tenant = groups.find((g) => g.key === 'tenant')!;
      expect(tenant.fields![0]).toMatchObject({ apiUrl: `${BASE_URL}/api/host/hostels/h1/renters` });
    });
  });

  // A nightly hostel bills bookings only: no type to choose and no renter for the tenant filter.
  describe('not billing renters', () => {
    const groups = invoiceFilterGroups('h1', STATUS, BASE_URL, false);

    it('drops the type and tenant groups', () => {
      const keys = groups.map((g) => g.key);

      expect(keys).not.toContain('kind');
      expect(keys).not.toContain('tenant');
    });

    it('keeps status, room and date', () => {
      expect(groups.map((g) => g.key)).toEqual(['status', 'room', 'date']);
    });
  });
});
