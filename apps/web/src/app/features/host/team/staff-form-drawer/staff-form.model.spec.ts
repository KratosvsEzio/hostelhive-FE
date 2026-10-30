import { Staff } from '@hostelhive/data-access';
import {
  StaffForm,
  emptyStaffForm,
  isStaffFormValid,
  emailError,
  leavingBeforeJoining,
  managerPasswordError,
  staffFormFrom,
  toCreateStaffPayload,
  toUpdateStaffPayload,
} from './staff-form.model';

function validForm(overrides: Partial<StaffForm> = {}): StaffForm {
  return {
    ...emptyStaffForm('2026-03-15'),
    name: 'Ali Khan',
    title: 'Warden',
    phone: '0300 1234567',
    salary: '25000',
    email: 'ali@evercare.pk',
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
  it('joins on the day it is given — the hostel’s today, chosen by the caller', () => {
    expect(emptyStaffForm('2026-03-16').joiningDate).toBe('2026-03-16');
  });

  it('carries no id, so it maps to a create', () => {
    expect(emptyStaffForm('2026-03-15').id).toBeUndefined();
  });

  it('leaves the leaving date blank — it is optional and has no sensible default', () => {
    expect(emptyStaffForm('2026-03-15').leavingDate).toBe('');
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

  /**
   * The backend validates an email on every staff record, so a non-manager without one was
   * refused with a 422 ("Email can't be blank") while the form let it through.
   */
  it('rejects a new staff member with no email, manager or not', () => {
    expect(isStaffFormValid(validForm({ email: '' }))).toBe(false);
    expect(emailError(validForm({ email: '  ' }))).toBe('Required.');
  });

  it('asks an older record saved without an email for one before an edit can save', () => {
    const f = staffFormFrom(staff({ email: undefined }));

    expect(f.hasStoredEmail).toBe(false);
    expect(isStaffFormValid({ ...f, salary: '25000' })).toBe(false);
    expect(isStaffFormValid({ ...f, salary: '25000', email: 'ali@evercare.pk' })).toBe(true);
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

  it('sends the email, trimmed, for a staff member who is not a manager', () => {
    const p = toCreateStaffPayload(validForm({ email: '  ali@evercare.pk ' }));

    expect(p.email).toBe('ali@evercare.pk');
    expect('is_manager' in p).toBe(false);
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

  it('leaves a stored email off the edit, and sends one typed for a record that had none', () => {
    expect('email' in toUpdateStaffPayload(staffFormFrom(staff({ email: 'ali@evercare.pk' })))).toBe(false);

    const missing = { ...staffFormFrom(staff({ email: undefined })), email: 'ali@evercare.pk' };
    expect(toUpdateStaffPayload(missing).email).toBe('ali@evercare.pk');
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
    expect(fromApi({ email: undefined }).email).toBe('');
  });

  it('seeds the email from the record when there is one', () => {
    expect(fromApi({ email: 'warden@evercare.pk' }).email).toBe('warden@evercare.pk');
  });

  it('asks for an email once manager access is on', () => {
    const f = { ...fromApi({ email: undefined }), isManager: true };

    expect(emailError(f)).toBe('Required.');
  });

  it('asks for a password for someone who was not already a manager', () => {
    const f = { ...fromApi({ email: undefined }), isManager: true };

    expect(managerPasswordError(f)).toBe('Required.');
  });

  it('rejects an address that is not one', () => {
    const f = { ...fromApi(), isManager: true, email: 'warden@' };

    expect(emailError(f)).toBe('Enter a valid email address.');
  });

  // The email is a staff field now; only the password belongs to manager access.
  it('still asks for the email, but no password, while manager access is off', () => {
    const f = fromApi({ email: undefined });

    expect(emailError(f)).toBe('Required.');
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
      email: '  Warden@EverCare.pk  ',
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
      email: 'warden@evercare.pk',
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
    const p = toUpdateStaffPayload({ ...validForm(), managerPassword: 'hunter2' });

    expect('is_manager' in p).toBe(false);
    expect('password' in p).toBe(false);
  });
});

/**
 * A record that already carries an email.
 *
 * The address is fixed and never re-sent. Whether it has a login is unknown —
 * `StaffSerializer#user` returns the staff's own id for every record, so it cannot answer "is
 * there an account". The server reuses an account it finds and needs a password only when
 * there is none, so the password is offered but optional.
 *
 * It used to be disabled and never sent, which left "stored address, no account" a 422 that
 * could not be fixed from the form. Now that every staff record carries an email, that would
 * be every first manager grant.
 */
describe('manager access on a record that already has an email', () => {
  const STORED = { ...validForm(), hasStoredEmail: true, email: 'warden@evercare.pk' };

  it('reads the flag off the stored address', () => {
    expect(staffFormFrom(staff({ email: 'warden@evercare.pk' })).hasStoredEmail).toBe(true);
    expect(staffFormFrom(staff({ email: undefined })).hasStoredEmail).toBe(false);
  });

  it('demands neither credential', () => {
    const f = { ...STORED, isManager: true };

    expect(emailError(f)).toBe('');
    expect(managerPasswordError(f)).toBe('');
    expect(isStaffFormValid(f)).toBe(true);
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

  // For an address with no account yet, the server needs one to create the login.
  it('sends a password the host typed', () => {
    const p = toUpdateStaffPayload({ ...STORED, isManager: true, managerPassword: 'hunter2' });

    expect(p.is_manager).toBe(true);
    expect(p.password).toBe('hunter2');
    expect('email' in p).toBe(false);
  });

  // The other half of the rule, so the two cannot drift into agreeing.
  it('still demands both when the record has no stored address', () => {
    const f = { ...validForm(), isManager: true, email: '', managerPassword: '' };

    expect(emailError(f)).toBe('Required.');
    expect(managerPasswordError(f)).toBe('Required.');
  });
});
