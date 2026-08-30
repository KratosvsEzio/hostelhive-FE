import { tenantStatusLabel, tenantStatusTone } from './tenant-status';

/**
 * The room page used to map this two ways — `active`, or "Checked out" for everything else —
 * so a tenant the API reported as Inactive was shown as having left the building. These pin
 * the four apart, because the failure is silent: the label is plausible, and only the API
 * response says otherwise.
 */
describe('tenantStatusLabel', () => {
  it('tells the four statuses apart', () => {
    expect(tenantStatusLabel('active')).toBe('Active');
    expect(tenantStatusLabel('inactive')).toBe('Inactive');
    expect(tenantStatusLabel('on-notice')).toBe('On notice');
    expect(tenantStatusLabel('checked-out')).toBe('Checked-out');
  });

  // Never "Checked out" — that is a claim about where somebody is, and this one is a guess.
  it('never reports a non-active tenant as gone', () => {
    expect(tenantStatusLabel('inactive')).not.toBe('Checked-out');
    expect(tenantStatusLabel('on-notice')).not.toBe('Checked-out');
  });

  /**
   * The backend owns this vocabulary and can add to it. Showing the raw slug is honest about
   * a state the frontend has not been taught; a fallback label would assert the wrong one.
   */
  it('shows an unrecognised status as it arrived', () => {
    expect(tenantStatusLabel('suspended')).toBe('suspended');
    expect(tenantStatusLabel('')).toBe('');
  });
});

describe('tenantStatusTone', () => {
  it('warms only the status a host has to act on', () => {
    expect(tenantStatusTone('on-notice')).toBe('warn');
    expect(tenantStatusTone('active')).toBe('ok');
    expect(tenantStatusTone('inactive')).toBe('neutral');
    expect(tenantStatusTone('checked-out')).toBe('neutral');
  });

  // A colour is a claim; on an unknown status it would be a guess.
  it('stays neutral for anything it does not know', () => {
    expect(tenantStatusTone('suspended')).toBe('neutral');
  });
});
