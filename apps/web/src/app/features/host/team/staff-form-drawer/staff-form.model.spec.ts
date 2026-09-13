import { Staff } from '@hostelhive/data-access';
import {
  StaffForm,
  emptyStaffForm,
  isStaffFormValid,
  leavingBeforeJoining,
  managerEmailError,
  managerPasswordError,
  staffFormFrom,
  toCreateStaffPayload,
  toUpdateStaffPayload,
} from './staff-form.model';

function validForm(overrides: Partial<StaffForm> = {}): StaffForm {
  return {
    ...emptyStaffForm(),
    name: 'Ali Khan',
    title: 'Warden',
    phone: '0300 1234567',
    salary: '25000',
    ...overrides,
  };
}

function staff(overrides: Partial<Staff> = {}): Staff {
  return {
    id: 's-1',
    name: 'Ali Khan',
    title: 'Warden',
    phone: '0300 1234567',
    hostelId: 'h-1',
    hostelName: 'Ever Care',
    cnic: '3520212345671',
    joiningDate: '2026-01-15',
    salary: 25000,
    status: 'active',
    statusLabel: 'Active',
    ...overrides,
  };
}

describe('emptyStaffForm', () => {
  it('defaults the joining date to the local calendar day', () => {
    const d = new Date();
    const pad = (n: number) => String(n).padStart(2, '0');
    // Local parts, not toISOString(): the latter is UTC and returns the previous day
    // for the first five hours of every day in PKT.
    expect(emptyStaffForm().joiningDate).toBe(
      `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`,
    );
  });

  it('carries no id, so it maps to a create', () => {
    expect(emptyStaffForm().id).toBeUndefined();
  });

  it('leaves the leaving date blank — it is optional and has no sensible default', () => {
    expect(emptyStaffForm().leavingDate).toBe('');
  });
});

describe('staffFormFrom', () => {
  it('keeps the id for an update and stringifies the salary', () => {
    const f = staffFormFrom(staff());
    expect(f.id).toBe('s-1');
    expect(f.salary).toBe('25000');
  });

  it('distinguishes a zero salary from an absent one', () => {
    expect(staffFormFrom(staff({ salary: 0 })).salary).toBe('0');
  });

  it('blanks the list placeholders rather than seeding them as real text', () => {
    const f = staffFormFrom(staff({ name: '—', title: '—', phone: '—' }));
    expect([f.name, f.title, f.phone]).toEqual(['', '', '']);
  });

  it('shows a stored CNIC image but holds no id for it, since the API sends none', () => {
    const f = staffFormFrom(staff({ cnicFrontUrl: 'https://x/front.jpg' }));
    expect(f.cnicFrontUrl).toBe('https://x/front.jpg');
    expect(f.cnicFrontUploadId).toBe('');
  });
});

describe('isStaffFormValid', () => {
  it('accepts a form with just the required fields', () => {
    expect(isStaffFormValid(validForm())).toBe(true);
  });

  it('rejects a form missing any single required field', () => {
    for (const key of ['name', 'title', 'phone', 'joiningDate', 'salary'] as const) {
      expect(isStaffFormValid(validForm({ [key]: '' }))).toBe(false);
    }
  });

  it('treats a whitespace-only required field as missing', () => {
    expect(isStaffFormValid(validForm({ name: '   ' }))).toBe(false);
  });

  it('keeps CNIC and address optional', () => {
    expect(isStaffFormValid(validForm({ cnicNumber: '', address: '' }))).toBe(true);
  });
});

describe('leavingBeforeJoining', () => {
  it('rejects a leaving date before the joining date', () => {
    const f = validForm({ joiningDate: '2026-06-22', leavingDate: '2026-06-21' });
    expect(leavingBeforeJoining(f)).toBe(true);
    expect(isStaffFormValid(f)).toBe(false);
  });

  it('accepts the same day and later', () => {
    expect(leavingBeforeJoining(validForm({ joiningDate: '2026-06-22', leavingDate: '2026-06-22' }))).toBe(false);
    expect(leavingBeforeJoining(validForm({ joiningDate: '2026-06-22', leavingDate: '2026-06-23' }))).toBe(false);
  });

  it('stays silent while the leaving date is blank, which is optional', () => {
    expect(leavingBeforeJoining(validForm({ leavingDate: '' }))).toBe(false);
  });
});

describe('toCreateStaffPayload', () => {
  it('trims text and coerces the salary', () => {
    const p = toCreateStaffPayload(validForm({ name: '  Ali Khan  ', salary: ' 25000 ' }));
    expect(p.name).toBe('Ali Khan');
    expect(p.salary).toBe(25000);
  });

  it('omits blank optionals rather than sending empty values', () => {
    const p = toCreateStaffPayload(validForm());
    expect(p.address).toBeUndefined();
    expect(p.cnic_number).toBeUndefined();
    expect(p.leaving_date).toBeUndefined();
    expect(p.avatar_id).toBeUndefined();
  });

  it('never sends an id — the server assigns it', () => {
    expect('id' in toCreateStaffPayload(validForm({ id: 's-1' }))).toBe(false);
  });

  // The server assigns it — verified live: a POST with no status comes back Active.
  it('never sends a status', () => {
    expect('status_id' in toCreateStaffPayload(validForm())).toBe(false);
  });

  it('sends an image id only once a file has been picked', () => {
    expect(toCreateStaffPayload(validForm({ avatarUploadId: 'up-1' })).avatar_id).toBe('up-1');
  });
});

describe('toUpdateStaffPayload', () => {
  it('sends an explicit null for a cleared leaving date so the unset persists', () => {
    expect(toUpdateStaffPayload(validForm({ leavingDate: '' })).leaving_date).toBeNull();
  });

  it('forwards a populated leaving date', () => {
    expect(toUpdateStaffPayload(validForm({ leavingDate: '2026-12-31' })).leaving_date).toBe('2026-12-31');
  });

  // Status is the server's to set — neither write carries it.
  it('never sends a status', () => {
    expect('status_id' in toUpdateStaffPayload(validForm())).toBe(false);
  });

  // The API returns CNIC images as URLs with no id, so an untouched one cannot be
  // re-sent. Omitting the key leaves it alone; a blank would wipe it.
  it('omits the image ids when no new file was picked', () => {
    const p = toUpdateStaffPayload(staffFormFrom(staff({ cnicFrontUrl: 'https://x/f.jpg' })));
    expect('cnic_front_id' in p && p.cnic_front_id !== undefined).toBe(false);
  });

  it('round-trips a saved record back to the shape it came from', () => {
    const p = toUpdateStaffPayload(staffFormFrom(staff()));
    expect(p.name).toBe('Ali Khan');
    expect(p.joining_date).toBe('2026-01-15');
    expect(p.salary).toBe(25000);
  });
});

/**
 * Manager access credentials.
 *
 * These were unreachable. The form took the detail endpoint's `user.id` as proof of an
 * existing login and disabled both fields under "this person already has an account" — but
 * `StaffSerializer#user` returns `{id: object.obfuscated_id}`, the staff's own id, for every
 * record. So the note was shown to everyone, the fields were disabled for everyone, and the
 * payload carried `is_manager: true` alone: a host could never grant manager access from the
 * edit drawer at all, least of all to the staff in the report whose `email` was null.
 */
describe('manager access credentials', () => {
  /** What the API actually returns: `user.id` present, mirroring the staff's own id. */
  function fromApi(overrides: Partial<Staff> = {}): StaffForm {
    return staffFormFrom(staff({ id: 'SwEcOA', userId: 'SwEcOA', ...overrides }));
  }

  it('leaves the email empty when the record has none to seed it with', () => {
    expect(fromApi({ email: undefined }).managerEmail).toBe('');
  });

  it('seeds the email from the record when there is one', () => {
    expect(fromApi({ email: 'warden@evercare.pk' }).managerEmail).toBe('warden@evercare.pk');
  });

  it('asks for an email once manager access is on', () => {
    const f = { ...fromApi({ email: undefined }), isManager: true };

    expect(managerEmailError(f)).toBe('Required.');
  });

  it('asks for a password for someone who was not already a manager', () => {
    const f = { ...fromApi({ email: undefined }), isManager: true };

    expect(managerPasswordError(f)).toBe('Required.');
  });

  it('rejects an address that is not one', () => {
    const f = { ...fromApi(), isManager: true, managerEmail: 'warden@' };

    expect(managerEmailError(f)).toBe('Enter a valid email address.');
  });

  it('asks for neither while manager access is off', () => {
    const f = fromApi({ email: undefined });

    expect(managerEmailError(f)).toBe('');
    expect(managerPasswordError(f)).toBe('');
  });

  /**
   * An existing manager keeps the password they have. The API never returns it, so a blank
   * field means "unchanged" rather than "not set".
   */
  it('lets an existing manager keep their password', () => {
    const f = { ...fromApi({ isManager: true, email: 'warden@evercare.pk' }), managerPassword: '' };

    expect(f.wasManager).toBe(true);
    expect(managerPasswordError(f)).toBe('');
  });

  it('carries the credentials into the payload', () => {
    const p = toUpdateStaffPayload({
      ...validForm(),
      isManager: true,
      managerEmail: '  Warden@EverCare.pk  ',
      managerPassword: 'hunter2',
    });

    expect(p.is_manager).toBe(true);
    expect(p.email).toBe('Warden@EverCare.pk');
    expect(p.password).toBe('hunter2');
  });

  // Blank means "leave it alone", so the key must be absent rather than empty.
  it('omits the password when none was typed', () => {
    const p = toUpdateStaffPayload({
      ...validForm(),
      isManager: true,
      wasManager: true,
      managerEmail: 'warden@evercare.pk',
      managerPassword: '',
    });

    expect(p.is_manager).toBe(true);
    expect('password' in p).toBe(false);
  });

  /**
   * The toggle being off must never revoke access as a side effect of editing a salary, so
   * the flag is omitted rather than sent as false.
   */
  it('sends no manager fields at all while the toggle is off', () => {
    const p = toUpdateStaffPayload(validForm());

    expect('is_manager' in p).toBe(false);
    expect('email' in p).toBe(false);
    expect('password' in p).toBe(false);
  });
});

/**
 * A record that already carries an email.
 *
 * Taken as "this person already has a login": the server looks the address up and reuses the
 * account it finds, so the form shows both credentials filled-and-disabled rather than asking
 * for a password it knows will be ignored.
 *
 * The address is a stand-in for the fact nobody sends us — `StaffSerializer#user` returns the
 * staff's own id for every record, so it cannot answer "is there an account".
 */
describe('manager access on a record that already has an email', () => {
  const STORED = { ...validForm(), hasStoredEmail: true, managerEmail: 'warden@evercare.pk' };

  it('reads the flag off the stored address', () => {
    expect(staffFormFrom(staff({ email: 'warden@evercare.pk' })).hasStoredEmail).toBe(true);
    expect(staffFormFrom(staff({ email: undefined })).hasStoredEmail).toBe(false);
  });

  it('asks for neither credential', () => {
    const f = { ...STORED, isManager: true };

    expect(managerEmailError(f)).toBe('');
    expect(managerPasswordError(f)).toBe('');
  });

  /**
   * The address is left off — it is already on the record for the server to look up, and
   * re-sending it risks overwriting it with whatever the disabled field holds.
   */
  it('sends the flag alone when no password was typed', () => {
    const p = toUpdateStaffPayload({ ...STORED, isManager: true });

    expect(p.is_manager).toBe(true);
    expect('email' in p).toBe(false);
    expect('password' in p).toBe(false);
  });

  /**
   * Nothing is collected, so nothing is sent — even if a value somehow sits on the form.
   *
   * The field is disabled in this state, so a password here could only be stale state rather
   * than something the host typed. Sending it would set a password nobody asked for.
   */
  it('sends no password even when one is on the form', () => {
    const p = toUpdateStaffPayload({ ...STORED, isManager: true, managerPassword: 'hunter2' });

    expect(p.is_manager).toBe(true);
    expect('password' in p).toBe(false);
    expect('email' in p).toBe(false);
  });

  // Disabled, so an empty one must never block the save.
  it('does not demand a password', () => {
    expect(managerPasswordError({ ...STORED, isManager: true })).toBe('');
    expect(isStaffFormValid({ ...STORED, isManager: true })).toBe(true);
  });

  // The other half of the rule, so the two cannot drift into agreeing.
  it('still collects both when the record has no stored address', () => {
    const f = { ...validForm(), isManager: true, managerEmail: '', managerPassword: '' };

    expect(managerEmailError(f)).toBe('Required.');
    expect(managerPasswordError(f)).toBe('Required.');
  });
});
