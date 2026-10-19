import { of } from 'rxjs';
import { TestBed } from '@angular/core/testing';
import { ApiClient } from '@core/api-resource';
import { StudentApi } from '@services';
import { BILLING_NOTIFICATION_TYPES, billingPageFor } from './notification-links';

describe('billingPageFor', () => {
  it.each([...BILLING_NOTIFICATION_TYPES])(
    'opens the hostel billing page for %s',
    (inviteType) => {
      expect(billingPageFor({ inviteType, hostelId: 'zppsla' })).toEqual([
        '/host',
        'zppsla',
        'subscription',
      ]);
    },
  );

  it('covers every billing type the backend sends, and no others', () => {
    expect([...BILLING_NOTIFICATION_TYPES].sort()).toEqual([
      'card_declined',
      'card_expiring',
      'payment_received',
      'payment_rejected',
      'renewal_invoice',
      'renewal_reminder',
      'subscription_ended',
      'subscription_past_due',
    ]);
  });

  it('leaves a billing notice with no hostel unclickable', () => {
    expect(billingPageFor({ inviteType: 'card_declined', hostelId: null })).toBeNull();
    expect(billingPageFor({ inviteType: 'card_declined', hostelId: '' })).toBeNull();
  });

  it.each(['meal_confirmation', 'booking_confirmation', 'review_request', 'hostel_is_live', 'rent'])(
    'gives %s no billing link even when it carries a hostel',
    (inviteType) => {
      expect(billingPageFor({ inviteType, hostelId: 'zppsla' })).toBeNull();
    },
  );
});

describe('StudentApi.listInvites hostel_id', () => {
  function listWith(raw: Record<string, unknown>[]) {
    TestBed.configureTestingModule({
      providers: [
        StudentApi,
        { provide: ApiClient, useValue: { get: () => of({ success: true, user_invites: raw }) } },
      ],
    });
    let items: { hostelId: string | null }[] = [];
    TestBed.inject(StudentApi)
      .listInvites()
      .subscribe((r) => (items = r.items));
    return items;
  }

  afterEach(() => TestBed.resetTestingModule());

  it('carries the hostel id the server sends', () => {
    const [item] = listWith([
      { id: 'n1', invitation_acceptance_type: 'card_declined', associated_id: 'pay1', hostel_id: 'zppsla' },
    ]);
    expect(item.hostelId).toBe('zppsla');
  });

  it('reads a missing, null or empty hostel id as none', () => {
    const items = listWith([
      { id: 'n1', invitation_acceptance_type: 'email_confirmation' },
      { id: 'n2', invitation_acceptance_type: 'card_declined', hostel_id: null },
      { id: 'n3', invitation_acceptance_type: 'card_declined', hostel_id: '' },
    ]);
    expect(items.map((i) => i.hostelId)).toEqual([null, null, null]);
  });
});
