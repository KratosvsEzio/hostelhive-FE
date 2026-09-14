import { Staff } from '@hostelhive/data-access';
import {
  applyDemotions,
  applySaved,
  StaffRowPermissions,
  StaffRowViewer,
  canActOnStaffRow,
  isOwnStaffRecord,
} from './staff-row-actions';

const ME: StaffRowViewer = { id: 'SebEcO', email: 'manager@evercare.pk' };

function staff(over: Partial<Staff> = {}): Staff {
  return {
    id: 'st1',
    name: 'Aashir Azeem',
    title: 'Cook',
    phone: '+923030491909',
    hostelId: 'nHelLt',
    hostelName: 'Ever Care Hostel',
    cnic: '',
    joiningDate: '2026-08-18',
    salary: 23_444,
    status: 'active',
    statusLabel: 'Active',
    ...over,
  } as Staff;
}

const ALL: StaffRowPermissions = { edit: true, remove: true, removeManager: true };
const NONE: StaffRowPermissions = { edit: false, remove: false, removeManager: false };

/**
 * Which staff rows offer an action menu.
 *
 * The rule has two halves that fail in opposite directions, so both are pinned here: a
 * manager must not be handed Edit / Remove manager role / Remove on their own record, and
 * nobody should be handed a button that opens onto an empty popup.
 */
describe('isOwnStaffRecord', () => {
  // The detail endpoint sends `user`; this is the key to prefer when it is there.
  it('matches on userId when the record carries one', () => {
    expect(isOwnStaffRecord(staff({ userId: 'SebEcO' }), ME)).toBe(true);
    expect(isOwnStaffRecord(staff({ userId: 'other' }), ME)).toBe(false);
  });

  /**
   * The list endpoint does NOT send `user` — verified on the wire. Every row arrives with
   * `userId` undefined, so without this fallback the self-row would be indistinguishable
   * from everyone else's and would keep its menu.
   */
  it('falls back to email when the list row has no userId', () => {
    expect(isOwnStaffRecord(staff({ email: ME.email }), ME)).toBe(true);
    expect(isOwnStaffRecord(staff({ email: 'cook@evercare.pk' }), ME)).toBe(false);
  });

  // A staff record with no login is nobody's own, however it is named.
  it('is not self when the row has neither key', () => {
    expect(isOwnStaffRecord(staff(), ME)).toBe(false);
  });

  // userId is authoritative: a stale or reused email must not override it.
  it('ignores email once a userId is present', () => {
    expect(isOwnStaffRecord(staff({ userId: 'other', email: ME.email }), ME)).toBe(false);
  });

  it('is not self before the session has landed', () => {
    expect(isOwnStaffRecord(staff({ userId: 'SebEcO' }), null)).toBe(false);
  });
});

describe('canActOnStaffRow', () => {
  it('gives every other staff member a menu', () => {
    expect(canActOnStaffRow(staff({ id: 'st2' }), ME, ALL)).toBe(true);
  });

  // The whole point: a manager administering the team must not be able to edit their own
  // salary, revoke their own access, or delete their own record.
  it('withholds the menu on the viewer’s own record', () => {
    expect(canActOnStaffRow(staff({ email: ME.email, isManager: true }), ME, ALL)).toBe(false);
    expect(canActOnStaffRow(staff({ userId: ME.id, isManager: true }), ME, ALL)).toBe(false);
  });

  /**
   * "Is me", not "is a manager". A second manager is still administrable — silencing every
   * manager row would be a different rule, and the wrong one.
   */
  it('still offers a menu on a different manager', () => {
    const other = staff({ id: 'st9', isManager: true, userId: 'someone-else' });
    expect(canActOnStaffRow(other, ME, ALL)).toBe(true);
  });

  it('offers nothing when the session may do nothing', () => {
    expect(canActOnStaffRow(staff({ id: 'st2' }), ME, NONE)).toBe(false);
  });

  /**
   * The empty-popup case, and the reason this is per row rather than per table.
   *
   * `remove_manager` is the only permission whose item also depends on the row. A session
   * holding just that one can act on a manager and on nobody else — so a table-level answer
   * would put a button on every row and an empty menu under four of the five.
   */
  describe('holding only remove_manager', () => {
    const ONLY_RM: StaffRowPermissions = { edit: false, remove: false, removeManager: true };

    it('offers a menu on a manager row', () => {
      expect(canActOnStaffRow(staff({ id: 'st9', isManager: true }), ME, ONLY_RM)).toBe(true);
    });

    it('offers none on a row with no manager role to remove', () => {
      expect(canActOnStaffRow(staff({ id: 'st2', isManager: false }), ME, ONLY_RM)).toBe(false);
    });
  });

  // Edit alone is enough to earn the menu — the other two items hide themselves.
  it('offers a menu for edit-only and for delete-only sessions', () => {
    const onlyEdit: StaffRowPermissions = { edit: true, remove: false, removeManager: false };
    const onlyDel: StaffRowPermissions = { edit: false, remove: true, removeManager: false };
    expect(canActOnStaffRow(staff({ id: 'st2' }), ME, onlyEdit)).toBe(true);
    expect(canActOnStaffRow(staff({ id: 'st2' }), ME, onlyDel)).toBe(true);
  });
});

/**
 * Local demotion after `remove_manager`.
 *
 * The endpoint flips one boolean on one row and answers 200. Refetching the page to learn
 * that costs a request and the reader's place in the table, so the row is patched in hand.
 */
describe('applyDemotions', () => {
  const mgr = staff({ id: 'm1', isManager: true });
  const cook = staff({ id: 'c1', isManager: false });

  it('clears the manager flag on the demoted row', () => {
    const [a, b] = applyDemotions([mgr, cook], new Set(['m1']));
    expect(a.isManager).toBe(false);
    expect(b.isManager).toBe(false);
  });

  it('leaves every other row alone', () => {
    const other = staff({ id: 'm2', isManager: true });
    const out = applyDemotions([mgr, other], new Set(['m1']));
    expect(out.map((s) => s.isManager)).toEqual([false, true]);
  });

  // The items belong to the fetch's signal — writing through them would be invisible to
  // change detection and thrown away by the next load.
  it('copies rather than mutating the fetched record', () => {
    applyDemotions([mgr], new Set(['m1']));
    expect(mgr.isManager).toBe(true);
  });

  // The common case must not churn the reference every time the list recomputes.
  it('returns the same array when there is nothing to apply', () => {
    const items = [mgr, cook];
    expect(applyDemotions(items, new Set())).toBe(items);
  });

  // Already false server-side: re-applying would allocate a new object for no change.
  it('does not copy a row the server already reports as demoted', () => {
    const out = applyDemotions([cook], new Set(['c1']));
    expect(out[0]).toBe(cook);
  });

  it('ignores ids that are not on the page', () => {
    const items = [cook];
    expect(applyDemotions(items, new Set(['gone']))).toBe(items);
  });
});

/**
 * Local application of a saved record.
 *
 * `StaffApi.create` and `update` both answer with the persisted `Staff`, so the page has the
 * row a refetch would have gone to read. These pin that an edit corrects in place, a create
 * appends, and neither churns a reference it did not need to.
 */
describe('applySaved', () => {
  const a = staff({ id: 'a', name: 'Warden A' });
  const b = staff({ id: 'b', name: 'Cook B' });

  it('replaces a row the page already has', () => {
    const edited = { ...a, name: 'Warden A (renamed)' };
    const out = applySaved([a, b], [edited]);
    expect(out.map((s) => s.name)).toEqual(['Warden A (renamed)', 'Cook B']);
  });

  it('appends a row the page has never seen', () => {
    const fresh = staff({ id: 'c', name: 'Guard C' });
    const out = applySaved([a, b], [fresh]);
    expect(out.map((s) => s.id)).toEqual(['a', 'b', 'c']);
  });

  // Replace-or-append is decided by the page, not a flag — so a create that somehow comes
  // back with a known id corrects that row instead of doubling it.
  it('does not duplicate when a create returns a known id', () => {
    const out = applySaved([a, b], [{ ...a, name: 'Same row' }]);
    expect(out.length).toBe(2);
  });

  it('handles a replace and an append together', () => {
    const out = applySaved([a, b], [{ ...b, name: 'Cook B2' }, staff({ id: 'c' })]);
    expect(out.map((s) => s.id)).toEqual(['a', 'b', 'c']);
    expect(out[1].name).toBe('Cook B2');
  });

  it('returns the same array when nothing was saved', () => {
    const items = [a, b];
    expect(applySaved(items, [])).toBe(items);
  });

  // The fetched rows belong to the list signal and are replaced wholesale on the next load.
  it('does not mutate the fetched rows', () => {
    applySaved([a], [{ ...a, name: 'changed' }]);
    expect(a.name).toBe('Warden A');
  });
});
