import { Staff } from '@hostelhive/data-access';
import {
  StaffForm,
  emptyStaffForm,
  isStaffFormValid,
  leavingBeforeJoining,
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
