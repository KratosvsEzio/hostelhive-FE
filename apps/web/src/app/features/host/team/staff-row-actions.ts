import { Staff } from '@util/models/host';

/** The signed-in user, reduced to the two fields that can identify their staff record. */
export interface StaffRowViewer {
  id: string;
  email: string;
}

/** What the session may do to staff, resolved once rather than per row. */
export interface StaffRowPermissions {
  edit: boolean;
  remove: boolean;
  removeManager: boolean;
}

/**
 * Whether this staff record is the viewer's own.
 *
 * Two keys, because the two endpoints disagree about what they send. `GET /staffs/:id`
 * carries `user`, so a detail record knows its login id; the **index does not** — checked
 * on the wire, every row in the list arrives with `userId` undefined while the manager's
 * row still carries the `email` that login uses.
 *
 * So `userId` is preferred and `email` is the fallback, rather than either alone: an id
 * comparison on list rows would match nothing and silently hand the viewer a menu on their
 * own record, which is the failure this exists to prevent. Email is the weaker key — it
 * moves if the login address changes — so it is only consulted when there is no id.
 *
 * A record with neither cannot be anyone's own, and is not self.
 */
export function isOwnStaffRecord(staff: Staff, viewer: StaffRowViewer | null): boolean {
  if (!viewer) return false;
  if (staff.userId) return staff.userId === viewer.id;
  return !!staff.email && staff.email === viewer.email;
}

/**
 * Whether a staff row should offer an action menu.
 *
 * Two independent reasons to withhold it, and both matter:
 *
 * **It is the viewer's own record.** A manager administers the team and their employment
 * record sits in that team, so their own row offered them Edit, Remove manager role and
 * Remove — their own salary, their own access, their own record. The last two are one click
 * from locking themselves out of the page they are standing on, with nobody else able to
 * undo it. Note this is "is me", not "is a manager": `isManager` happens to pick the right
 * row in a hostel with one manager, but with two it would silence both menus when the point
 * is that each may still administer the other.
 *
 * **The menu would be empty.** Every item is permissioned, and "Remove manager role" also
 * depends on the row, so a session holding only that permission would get a button on every
 * row and an empty popup on all the non-managers. A control that opens onto nothing reads as
 * broken, which is worse than no control.
 */
export function canActOnStaffRow(
  staff: Staff,
  viewer: StaffRowViewer | null,
  perms: StaffRowPermissions,
): boolean {
  if (isOwnStaffRecord(staff, viewer)) return false;
  return perms.edit || perms.remove || (perms.removeManager && !!staff.isManager);
}

/**
 * The fetched page with locally-revoked manager roles applied.
 *
 * `remove_manager` changes one boolean on one row, and the 200 is the server confirming it.
 * Refetching the list to learn that costs a request, a spinner and the reader's place in the
 * table for an answer already in hand — so the row is patched instead.
 *
 * A copy, never a mutation: the items belong to the fetch's signal and are replaced wholesale
 * on the next load, so writing through them would be both invisible to change detection and
 * lost at the next fetch. Returns the original array untouched when there is nothing to
 * apply, so the common case allocates nothing and downstream `computed`s see a stable
 * reference.
 *
 * Guarded on `isManager` as well as membership: re-applying to a row the server already
 * reports as demoted would churn the reference for no change.
 */
export function applyDemotions<T extends Staff>(
  items: T[],
  demoted: ReadonlySet<string>,
): T[] {
  if (!demoted.size) return items;
  let changed = false;
  const next = items.map((s) => {
    if (!demoted.has(s.id) || !s.isManager) return s;
    changed = true;
    return { ...s, isManager: false };
  });
  // Held ids outlive the rows they were recorded for — a filter or a page change can leave a
  // set that matches nothing here. Returning `items` then keeps the reference stable, so a
  // list that did not change does not look changed to everything downstream.
  return changed ? next : items;
}

/**
 * The fetched page with locally-saved records applied — replaced in place, or appended.
 *
 * `StaffApi.create` and `update` both answer with the persisted `Staff`, so a save already
 * knows the row a refetch would have gone to read. Replace-or-append is decided by whether
 * the id is on the page, not by a flag from the drawer: it is the same question, and asking
 * the list means a create arriving with a known id corrects that row instead of doubling it.
 *
 * An appended row lands last rather than in the server's sort position — the one thing this
 * cannot reproduce. The trade is deliberate: someone who just filled in a staff member is
 * looking for confirmation it saved, and a row appearing where they are already looking says
 * that better than a reload that moves the whole table.
 *
 * Returns the original array when there is nothing to apply, so an untouched list does not
 * hand every downstream reader a new reference.
 */
export function applySaved<T extends Staff>(items: T[], saved: readonly T[]): T[] {
  if (!saved.length) return items;
  const byId = new Map(saved.map((s) => [s.id, s]));
  const next = items.map((row) => byId.get(row.id) ?? row);
  const added = saved.filter((s) => !items.some((row) => row.id === s.id));
  return added.length ? [...next, ...added] : next;
}
