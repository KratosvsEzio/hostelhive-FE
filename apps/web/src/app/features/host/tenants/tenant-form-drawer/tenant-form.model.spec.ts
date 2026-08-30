import { Tenant } from '@hostelhive/data-access';
import {
  CheckInForm,
  checkInFormFromTenant,
  emptyCheckInForm,
  fieldErrorFor,
  isCheckInFormValid,
  isFieldRequired,
  toCreateRenterPayload,
  toUpdateRenterPayload,
} from './tenant-form.model';

function validForm(overrides: Partial<CheckInForm> = {}): CheckInForm {
  return {
    ...emptyCheckInForm(),
    fullName: 'Hamza Tariq',
    email: 'hamza@example.com',
    phone: '0312 5556677',
    emergencyContact: '0321 1234567',
    cnicNumber: '42101-1234567-1',
    address: '123 Main St, Karachi',
    rent: '5000',
    advanceDeposit: '3333',
    ...overrides,
  };
}

function tenant(overrides: Partial<Tenant> = {}): Tenant {
  return {
    id: 't-1',
    name: 'Hamza Tariq',
    phone: '0312 5556677',
    initials: 'HT',
    roomId: 'r-9',
    roomNumber: '204',
    joined: '2026-01-15',
    rent: 5000,
    deposit: 3333,
    messBreakfast: true,
    messLunch: false,
    messDinner: true,
    outstanding: 0,
    status: 'active',
    statusLabel: 'Active',
    ...overrides,
  };
}

describe('emptyCheckInForm', () => {
  /**
   * The clock is pinned for these.
   *
   * "Today" was previously read from a second `new Date()` inside the assertion, which made
   * the test agree with the code by construction — it could only catch a disagreement, never
   * a wrong answer, and it went red for seven minutes a night when the two calls landed on
   * different days. A fixed instant asserts the actual string.
   */
  function at(y: number, monthIndex: number, day: number, h: number, m: number): void {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(y, monthIndex, day, h, m, 30));
  }

  afterEach(() => vi.useRealTimers());

  it('defaults the joining datetime to local now and the billing cycle to the 1st and 5th', () => {
    at(2026, 7, 25, 14, 37);
    const f = emptyCheckInForm();

    // Local parts, not toISOString(): the latter is UTC and returns the previous day
    // for the first five hours of every day in PKT.
    // 14:37, not 14:30. The minute used to be floored to the picker's step because the
    // column only offered quarter-hours; it offers all sixty now, so the default is the
    // minute the host is actually standing in.
    expect(f.joiningDate).toBe('2026-08-25T14:37');
    expect(f.billingDate).toBe('1');
    expect(f.billingDueDate).toBe('5');
  });

  /**
   * The bug this pair exists for.
   *
   * Rounding to the nearest step turned 23:53 into 00:00 and carried the date into the next
   * day, so a tenant checked in at the desk on the 25th was recorded as joining on the 26th
   * — and the joining time sat seven minutes in the future.
   *
   * There is no rounding left to carry, so these hold by construction rather than by
   * flooring. They are kept because the invariant is the point, not the mechanism:
   * whatever this function does next must not move a check-in onto another day.
   */
  it('does not roll into tomorrow late at night', () => {
    at(2026, 7, 25, 23, 53);
    expect(emptyCheckInForm().joiningDate).toBe('2026-08-25T23:53');
  });

  it('never dates the joining in the future', () => {
    for (const [h, m] of [[23, 59], [23, 53], [0, 14], [12, 44], [9, 7]]) {
      at(2026, 7, 25, h, m);
      const joined = emptyCheckInForm().joiningDate;

      expect(joined.slice(0, 10)).toBe('2026-08-25');
      expect(joined <= `2026-08-25T${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`).toBe(true);
    }
  });

  it('holds the last day of a month', () => {
    at(2026, 7, 31, 23, 58);
    expect(emptyCheckInForm().joiningDate).toBe('2026-08-31T23:58');
  });

  // Any minute, not one of four. The picker has no grid to preselect onto now, so a
  // check-in at 14:37 is recorded as 14:37 rather than filed thirteen minutes early.
  it('carries the minute it actually happened on', () => {
    at(2026, 7, 25, 14, 37);
    const f = emptyCheckInForm();
    expect(f.joiningDate.length).toBe(16);
    expect(f.joiningDate[10]).toBe('T');
    expect(f.joiningDate[13]).toBe(':');
    expect(f.joiningDate.slice(14, 16)).toBe('37');
  });

  it('leaves the check-out blank — it is optional and has no sensible default', () => {
    expect(emptyCheckInForm().leaveDate).toBe('');
  });

  it('carries no tenant id, so it maps to a create', () => {
    expect(emptyCheckInForm().id).toBeUndefined();
  });

  it('pre-selects the given room and leaves the number for the room list to fill', () => {
    const f = emptyCheckInForm('r-9');
    expect(f.roomId).toBe('r-9');
    expect(f.roomNumber).toBe('');
  });

  it('leaves the room blank when none was given', () => {
    expect(emptyCheckInForm().roomId).toBe('');
  });
});

describe('checkInFormFromTenant', () => {
  it('stringifies the money fields and keeps the tenant id for an update', () => {
    const f = checkInFormFromTenant(tenant());
    expect(f.id).toBe('t-1');
    expect(f.rent).toBe('5000');
    expect(f.advanceDeposit).toBe('3333');
  });

  it('blanks absent optional text rather than emitting undefined', () => {
    const f = checkInFormFromTenant(tenant({ email: undefined, cnic: undefined, address: undefined }));
    expect([f.email, f.cnicNumber, f.address]).toEqual(['', '', '']);
  });

  it('distinguishes a zero charge from an absent one', () => {
    expect(checkInFormFromTenant(tenant({ messCharges: 0 })).messCharges).toBe('0');
    expect(checkInFormFromTenant(tenant({ messCharges: undefined })).messCharges).toBe('');
  });

  it('rejects an unselectable billing day instead of clamping it', () => {
    const f = checkInFormFromTenant(tenant({ billingDate: 0, billingDueDate: 5 }));
    expect(f.billingDate).toBe('');
    expect(f.billingDueDate).toBe('5');
  });

  it('labels an existing photo without a preview url', () => {
    const f = checkInFormFromTenant(tenant({ avatarId: 'up-1' }));
    expect(f.imageName).toBe('Photo on file');
    expect(f.imagePreview).toBe('');
    expect(f.avatarUploadId).toBe('up-1');
  });

  it('leaves the photo fields empty when the tenant has none', () => {
    const f = checkInFormFromTenant(tenant());
    expect([f.imageName, f.cnicFrontName, f.cnicBackName]).toEqual(['', '', '']);
  });
});

describe('isCheckInFormValid', () => {
  it('accepts a fully populated form', () => {
    expect(isCheckInFormValid(validForm())).toBe(true);
  });

  it('treats a whitespace-only required field as missing', () => {
    expect(isCheckInFormValid(validForm({ fullName: '   ' }))).toBe(false);
  });

  it('rejects a form missing any single required field', () => {
    const required = [
      'fullName',
      'email',
      'phone',
      'cnicNumber',
      'address',
      'joiningDate',
      'rent',
      'advanceDeposit',
      'billingDate',
      'billingDueDate',
    ] as const;
    for (const key of required) {
      const f = validForm();
      f[key] = '';
      expect(isCheckInFormValid(f)).toBe(false);
    }
  });

  it('registers without an emergency contact', () => {
    expect(isCheckInFormValid(validForm({ emergencyContact: '' }))).toBe(true);
  });

  it('keeps the room and the optional charges out of the required set', () => {
    expect(
      isCheckInFormValid(
        validForm({ roomId: '', leaveDate: '', messCharges: '', transportationCharges: '' }),
      ),
    ).toBe(true);
  });
});

describe('leaveBeforeJoin / ordering', () => {
  it('accepts a check-out after the check-in', () => {
    expect(isCheckInFormValid(validForm({ joiningDate: '2026-06-22', leaveDate: '2026-06-23' }))).toBe(true);
  });

  it('rejects a check-out on an earlier date', () => {
    expect(isCheckInFormValid(validForm({ joiningDate: '2026-06-22', leaveDate: '2026-06-21' }))).toBe(false);
  });

  it('rejects a same-day check-out earlier in the day — only reachable once times exist', () => {
    expect(isCheckInFormValid(validForm({ joiningDate: '2026-06-22T18:00', leaveDate: '2026-06-22T10:00' }))).toBe(false);
  });

  it('accepts a same-day check-out later in the day', () => {
    expect(isCheckInFormValid(validForm({ joiningDate: '2026-06-22T10:00', leaveDate: '2026-06-22T18:00' }))).toBe(true);
  });

  it('stays silent while the leave date is blank, which is optional', () => {
    expect(isCheckInFormValid(validForm({ joiningDate: '2026-06-22', leaveDate: '' }))).toBe(true);
  });
});

describe('toCreateRenterPayload', () => {
  it('trims text and coerces the numeric fields', () => {
    const p = toCreateRenterPayload(validForm({ fullName: '  Hamza Tariq  ', advanceDeposit: '3333' }));
    expect(p.full_name).toBe('Hamza Tariq');
    expect(p.advance_deposit).toBe(3333);
    expect(p.billing_date).toBe(1);
    expect(p.billing_due_date).toBe(5);
  });

  it('omits blank optionals rather than sending empty values', () => {
    const p = toCreateRenterPayload(
      validForm({ roomId: '', messCharges: '', transportationCharges: '', leaveDate: '' }),
    );
    expect(p.room_id).toBeUndefined();
    expect(p.mess_charges).toBeUndefined();
    expect(p.transportation_charges).toBeUndefined();
    expect(p.leave_date).toBeUndefined();
  });

  it('forwards the populated optionals', () => {
    const p = toCreateRenterPayload(
      validForm({ roomId: 'r-9', messCharges: '3000', transportationCharges: '500', leaveDate: '2026-12-31' }),
    );
    expect(p.room_id).toBe('r-9');
    expect(p.mess_charges).toBe(3000);
    expect(p.transportation_charges).toBe(500);
    expect(p.leave_date).toBe('2026-12-31');
  });

  it('sends a bare date untouched, so a date-only value is unchanged by this feature', () => {
    const p = toCreateRenterPayload(validForm({ joiningDate: '2026-06-22', leaveDate: '2026-12-31' }));
    expect(p.joining_date).toBe('2026-06-22');
    expect(p.leave_date).toBe('2026-12-31');
  });

  it('completes a datetime value with seconds for the wire', () => {
    const p = toCreateRenterPayload(validForm({ joiningDate: '2026-06-22T18:30', leaveDate: '2026-12-31T09:00' }));
    expect(p.joining_date).toBe('2026-06-22T18:30:00');
    expect(p.leave_date).toBe('2026-12-31T09:00:00');
  });

  it('sends the meal plan flags verbatim', () => {
    const p = toCreateRenterPayload(validForm({ messBreakfast: true, messLunch: false, messDinner: true }));
    expect([p.breakfast_enabled, p.lunch_enabled, p.dinner_enabled]).toEqual([true, false, true]);
  });
});

describe('toUpdateRenterPayload', () => {
  it('sends an explicit null for a cleared room so the unset persists', () => {
    expect(toUpdateRenterPayload(validForm({ roomId: '' })).room_id).toBeNull();
  });

  it('sends an explicit null for cleared charges so the unset persists', () => {
    const p = toUpdateRenterPayload(validForm({ messCharges: '', transportationCharges: '' }));
    expect(p.mess_charges).toBeNull();
    expect(p.transportation_charges).toBeNull();
  });

  it('sends an explicit null for a cleared leave date so the unset persists', () => {
    expect(toUpdateRenterPayload(validForm({ leaveDate: '' })).leave_date).toBeNull();
  });

  it('forwards the populated optionals', () => {
    const p = toUpdateRenterPayload(
      validForm({ roomId: 'r-9', messCharges: '3000', transportationCharges: '500' }),
    );
    expect(p.room_id).toBe('r-9');
    expect(p.mess_charges).toBe(3000);
    expect(p.transportation_charges).toBe(500);
  });

  it('trims text and coerces the numeric fields', () => {
    const p = toUpdateRenterPayload(validForm({ address: '  123 Main St  ', rent: ' 5000 ' }));
    expect(p.address).toBe('123 Main St');
    expect(p.rent).toBe('5000');
    expect(p.advance_deposit).toBe(3333);
  });

  it('round-trips a saved tenant back to the shape it came from', () => {
    const p = toUpdateRenterPayload(checkInFormFromTenant(tenant()));
    expect(p.full_name).toBe('Hamza Tariq');
    expect(p.room_id).toBe('r-9');
    expect(p.joining_date).toBe('2026-01-15');
  });
});

/**
 * A hostel billed per night has no day-of-month cycle.
 *
 * The flag comes from `billingFrequency`, not the accommodation type it used to read — the
 * two are set independently, so a backpacker hostel billed monthly was having its billing
 * day dropped from the payload. What the flag *does* is unchanged; only where it comes from.
 */
describe('nightly-billed stays', () => {
  const nightly = { nightly: true };

  it('does not require the billing cycle', () => {
    const f = validForm({ billingDate: '', billingDueDate: '' });
    expect(isCheckInFormValid(f)).toBe(false);
    expect(isCheckInFormValid(f, nightly)).toBe(true);
  });

  it('still requires everything else', () => {
    expect(isCheckInFormValid(validForm({ fullName: '  ' }), nightly)).toBe(false);
  });

  // Omitted, not zeroed — sending 0 or null would be stored as a real billing day.
  it('omits both billing keys from the create payload', () => {
    const p = toCreateRenterPayload(validForm(), nightly);
    expect('billing_date' in p).toBe(false);
    expect('billing_due_date' in p).toBe(false);
  });

  it('omits both billing keys from the update payload', () => {
    const p = toUpdateRenterPayload(validForm(), nightly);
    expect('billing_date' in p).toBe(false);
    expect('billing_due_date' in p).toBe(false);
  });

  it('still sends them for a monthly hostel', () => {
    const p = toCreateRenterPayload(validForm({ billingDate: '3', billingDueDate: '7' }));
    expect(p.billing_date).toBe(3);
    expect(p.billing_due_date).toBe(7);
  });
});

/**
 * Which fields a host actually has to fill in.
 *
 * This exists because the drawer used to answer the question twice. The Register button asked
 * REQUIRED_FIELDS; the red text under each field asked "is this box empty" — so the emergency
 * contact, which the button has always been happy to submit blank, told the host it was
 * required the moment they tabbed past it. The two answers have to come from one list, and the
 * last case here is what holds them together.
 */
describe('isFieldRequired', () => {
  const OPTIONAL = [
    'emergencyContact',
    'leaveDate',
    'roomId',
    'roomNumber',
    'messCharges',
    'transportationCharges',
    'imageName',
    'avatarUploadId',
    'cnicFrontUploadId',
    'cnicBackUploadId',
  ] as const;

  it('does not require the fields the form submits without', () => {
    for (const key of OPTIONAL) {
      expect([key, isFieldRequired(key)]).toEqual([key, false]);
    }
  });

  it('requires the ones it does', () => {
    for (const key of ['fullName', 'email', 'phone', 'cnicNumber', 'address', 'rent'] as const) {
      expect([key, isFieldRequired(key)]).toEqual([key, true]);
    }
  });

  // A nightly hostel has no day-of-month cycle, so the billing pair drops out of the
  // requirement — and has to drop out of the field errors with it.
  it('drops the billing cycle for a nightly stay', () => {
    expect(isFieldRequired('billingDate')).toBe(true);
    expect(isFieldRequired('billingDate', { nightly: false })).toBe(true);
    expect(isFieldRequired('billingDate', { nightly: true })).toBe(false);
    expect(isFieldRequired('billingDueDate', { nightly: true })).toBe(false);
  });

  /**
   * The invariant: a field is required exactly when blanking it stops the form submitting.
   *
   * Stated over every string field rather than a hand-written list, so a field added to one
   * definition and not the other fails here rather than in a host's face.
   */
  it('agrees with isCheckInFormValid on every field, monthly and nightly', () => {
    const FIELDS = Object.entries(validForm())
      .filter(([, v]) => typeof v === 'string')
      .map(([k]) => k as keyof CheckInForm);
    expect(FIELDS.length).toBeGreaterThan(15);

    for (const ctx of [undefined, { nightly: false }, { nightly: true }]) {
      expect(isCheckInFormValid(validForm(), ctx)).toBe(true);
      for (const key of FIELDS) {
        const blanked = validForm({ [key]: '' });
        expect([key, ctx?.nightly, isFieldRequired(key, ctx)]).toEqual([
          key,
          ctx?.nightly,
          !isCheckInFormValid(blanked, ctx),
        ]);
      }
    }
  });
});

/**
 * The message under a field.
 *
 * The reported bug in one line: "Emergency contact" carries no asterisk and the Register
 * button has always accepted it blank, but leaving it empty printed "This field is required"
 * in red under it. Check-out did the same on any form that failed to submit for some other
 * reason — and since the drawer scrolls to the first red message, a host could be sent to an
 * optional field to fix a problem that was somewhere else entirely.
 */
describe('fieldErrorFor', () => {
  it('says nothing about an empty optional field', () => {
    const f = validForm({ emergencyContact: '', leaveDate: '', messCharges: '' });
    expect(fieldErrorFor(f, 'emergencyContact')).toBe('');
    expect(fieldErrorFor(f, 'leaveDate')).toBe('');
    expect(fieldErrorFor(f, 'messCharges')).toBe('');
  });

  it('still reports an empty required field', () => {
    expect(fieldErrorFor(validForm({ phone: '' }), 'phone')).toBe('This field is required');
    expect(fieldErrorFor(validForm({ cnicNumber: '   ' }), 'cnicNumber')).toBe('This field is required');
  });

  it('says nothing when a required field is filled in', () => {
    expect(fieldErrorFor(validForm(), 'phone')).toBe('');
  });

  // Optional does not mean unchecked. A check-out is not required, but one that lands before
  // the check-in is a real error and has to survive the optional-field shortcut above it.
  it('still catches a check-out before the check-in', () => {
    const f = validForm({ joiningDate: '2026-06-22', leaveDate: '2026-06-21' });
    expect(fieldErrorFor(f, 'leaveDate')).toBe('Check-out must be after check-in');
  });

  it('leaves the billing cycle alone on a nightly stay', () => {
    const f = validForm({ billingDate: '', billingDueDate: '' });
    expect(fieldErrorFor(f, 'billingDate')).toBe('This field is required');
    expect(fieldErrorFor(f, 'billingDate', { nightly: true })).toBe('');
    expect(fieldErrorFor(f, 'billingDueDate', { nightly: true })).toBe('');
  });
});
