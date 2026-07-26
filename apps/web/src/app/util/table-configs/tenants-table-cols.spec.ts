import { Tenant, TenantStatus } from '@hostelhive/data-access';
import { TENANTS_TABLE_COLS } from './tenants-table-cols';

/** Resolve the status column's rendered pill for a given tenant status. */
function statusPill(status: TenantStatus) {
  const col = TENANTS_TABLE_COLS.find((c) => c.key === 'status');
  if (!col) throw new Error('status column missing');
  return col.cell({ status } as Tenant);
}

describe('tenants-table-cols — status column (B9)', () => {
  it('renders each API status verbatim, not collapsed to "Checked-out"', () => {
    expect(statusPill('active')).toEqual({ kind: 'pill', text: 'Active', tone: 'ok' });
    expect(statusPill('inactive')).toEqual({ kind: 'pill', text: 'Inactive', tone: 'neutral' });
    expect(statusPill('on-notice')).toEqual({ kind: 'pill', text: 'On notice', tone: 'warn' });
    expect(statusPill('checked-out')).toEqual({ kind: 'pill', text: 'Checked-out', tone: 'neutral' });
  });

  it('never maps "inactive" to "Checked-out" (the reported bug)', () => {
    const pill = statusPill('inactive');
    expect(pill).toMatchObject({ kind: 'pill' });
    if (pill.kind === 'pill') expect(pill.text).not.toBe('Checked-out');
  });

  it('falls back to the raw slug + neutral tone for an unknown status', () => {
    const pill = statusPill('archived' as TenantStatus);
    expect(pill).toEqual({ kind: 'pill', text: 'archived', tone: 'neutral' });
  });
});
