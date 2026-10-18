import { ComponentFixture, TestBed } from '@angular/core/testing';
import { TranslocoService } from '@jsverse/transloco';
import type { BillingPayment } from '@hostelhive/data-access';
import { provideI18nTesting } from '@core/i18n/provide-i18n-testing';
import { AdminPaymentAttempts } from './admin-payment-attempts';

const COPY = {
  adminBilling: {
    verification: { attemptsTitle: 'Payment attempts' },
    columns: {
      reference: 'Reference',
      tracker: 'Safepay tracker',
      created: 'Created',
      succeeded: 'Succeeded',
    },
    fields: { failureReason: 'Failure reason' },
    paymentStatus: {
      pending: 'Pending',
      awaiting: 'Awaiting verification',
      succeeded: 'Succeeded',
      failed: 'Failed',
    },
    method: {
      safepay: 'Safepay',
      bankTransfer: 'Bank transfer',
      cash: 'Cash',
      adminGrant: 'Admin grant',
      other: 'Other',
    },
    refund: {
      badge: 'Refund needed',
      body: 'Refund it from the Safepay dashboard using tracker {{tracker}}.',
    },
  },
};

const REFUND_REASON =
  'Invoice HH-2026-000123 was voided. Charged at Safepay (trk_9); refund it from the Safepay dashboard';

function status(slug: string, name = slug) {
  return { id: 1, name, slug };
}

function payment(over: Partial<BillingPayment> = {}): BillingPayment {
  return {
    id: 'pay1',
    status: status('succeeded', 'Succeeded'),
    payment_method: 'safepay',
    amount: '5000.00',
    currency: 'PKR',
    reference: null,
    gateway_reference: null,
    failure_reason: null,
    proof_url: null,
    verified_at: null,
    succeeded_at: null,
    created_at: '2026-10-11T09:05:00Z',
    invoice_id: 'iNv7Q',
    initiated_by: 'customer',
    ...over,
  };
}

describe('AdminPaymentAttempts', () => {
  let fixture: ComponentFixture<AdminPaymentAttempts>;

  function render(
    payments: readonly BillingPayment[],
    excludeId: string | null = null,
  ): HTMLElement {
    TestBed.configureTestingModule({ providers: [provideI18nTesting()] });
    TestBed.inject(TranslocoService).setTranslation(COPY, 'en');
    fixture = TestBed.createComponent(AdminPaymentAttempts);
    fixture.componentRef.setInput('payments', payments);
    fixture.componentRef.setInput('excludeId', excludeId);
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  }

  const rows = (el: HTMLElement) =>
    Array.from(el.querySelectorAll<HTMLElement>('[data-testid="attempt"]'));
  const field = (row: Element, name: string) =>
    row
      .querySelector(`[data-field="${name}"]`)
      ?.textContent?.replace(/\s+/g, ' ')
      .trim() ?? null;

  afterEach(() => TestBed.resetTestingModule());

  it('is headed by the admin title', () => {
    const el = render([payment()]);

    expect(el.querySelector('h2')?.textContent?.trim()).toBe(
      'Payment attempts',
    );
  });

  it('renders nothing when there are no attempts', () => {
    const el = render([]);

    expect(el.querySelector('hh-card')).toBeNull();
    expect(rows(el)).toHaveLength(0);
  });

  it('lists newest first without reordering the input', () => {
    const payments = [
      payment({ id: 'a', amount: '1000' }),
      payment({ id: 'b', amount: '2000' }),
      payment({ id: 'c', amount: '3000', currency: 'USD' }),
    ];
    const el = render(payments);

    expect(rows(el).map((r) => field(r, 'amount'))).toEqual([
      '$3,000',
      'PKR 2,000',
      'PKR 1,000',
    ]);
    expect(payments.map((p) => p.id)).toEqual(['a', 'b', 'c']);
  });

  it('wraps each amount in bdi', () => {
    const el = render([payment()]);

    expect(
      rows(el)[0].querySelector('[data-field="amount"] bdi')?.textContent,
    ).toBe('PKR 5,000');
  });

  it('leaves out the excluded attempt', () => {
    const el = render(
      [payment({ id: 'a' }), payment({ id: 'b', amount: '2000' })],
      'b',
    );

    expect(rows(el)).toHaveLength(1);
    expect(field(rows(el)[0], 'amount')).toBe('PKR 5,000');
  });

  it('renders nothing when the only attempt is excluded', () => {
    const el = render([payment({ id: 'a' })], 'a');

    expect(el.querySelector('hh-card')).toBeNull();
  });

  it('uses admin wording for methods and statuses', () => {
    const el = render([
      payment({ id: 'a', payment_method: 'admin_grant' }),
      payment({
        id: 'b',
        payment_method: 'bank_transfer',
        status: status('awaiting-verification', 'Awaiting'),
      }),
      payment({
        id: 'c',
        payment_method: 'cheque',
        status: status('refunded', 'Refunded'),
      }),
    ]);
    const [c, b, a] = rows(el);

    expect(field(a, 'method')).toBe('Admin grant');
    expect(field(b, 'method')).toBe('Bank transfer');
    expect(field(b, 'status')).toBe('Awaiting verification');
    expect(field(c, 'method')).toBe('Other');
    expect(field(c, 'status')).toBe('Refunded');
  });

  it('shows the reference, tracker and failure reason exactly as sent', () => {
    const reason = 'Amount or currency does not match invoice HH-2026-000123';
    const el = render([
      payment({
        status: status('failed', 'Failed'),
        reference: 'TRX-778',
        gateway_reference: 'trk_42',
        failure_reason: reason,
      }),
    ]);
    const row = rows(el)[0];

    expect(field(row, 'reference')).toBe('TRX-778');
    expect(field(row, 'tracker')).toBe('trk_42');
    expect(field(row, 'failure-reason')).toBe(reason);
    expect(field(row, 'status')).toBe('Failed');
    expect(field(row, 'refund')).toBeNull();
    expect(field(row, 'refund-badge')).toBeNull();
  });

  it('omits the reference, tracker and reason when there are none', () => {
    const row = rows(render([payment()]))[0];

    expect(field(row, 'reference')).toBeNull();
    expect(field(row, 'tracker')).toBeNull();
    expect(field(row, 'failure-reason')).toBeNull();
  });

  it('shows the dates in the offset the API sent', () => {
    const row = rows(
      render([payment({ succeeded_at: '2026-10-11T10:30:00Z' })]),
    )[0];

    expect(field(row, 'created')).toBe('11 Oct 2026, 09:05');
    expect(field(row, 'succeeded')).toBe('11 Oct 2026, 10:30');
  });

  it('calls out a charged payment that needs a refund, with its tracker', () => {
    const row = rows(
      render([
        payment({
          status: status('failed', 'Failed'),
          gateway_reference: 'trk_9',
          failure_reason: REFUND_REASON,
        }),
      ]),
    )[0];

    expect(field(row, 'refund-badge')).toBe('Refund needed');
    expect(field(row, 'refund')).toBe(
      'Refund it from the Safepay dashboard using tracker trk_9.',
    );
    expect(field(row, 'failure-reason')).toBe(REFUND_REASON);
  });

  it('does not call out a succeeded payment whatever its reason says', () => {
    const row = rows(render([payment({ failure_reason: REFUND_REASON })]))[0];

    expect(field(row, 'refund')).toBeNull();
    expect(field(row, 'refund-badge')).toBeNull();
  });
});
