import { Tenant } from '@hostelhive/data-access';
import {
  CheckInForm,
  checkInFormFromTenant,
  emptyCheckInForm,
  isCheckInFormValid,
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
  it('defaults the joining date to today and the billing cycle to the 1st and 5th', () => {
    const f = emptyCheckInForm();
    expect(f.joiningDate).toBe(new Date().toISOString().slice(0, 10));
    expect(f.billingDate).toBe('1');
    expect(f.billingDueDate).toBe('5');
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
      'emergencyContact',
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

  it('keeps the room and the optional charges out of the required set', () => {
    expect(
      isCheckInFormValid(
        validForm({ roomId: '', leaveDate: '', messCharges: '', transportationCharges: '' }),
      ),
    ).toBe(true);
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
