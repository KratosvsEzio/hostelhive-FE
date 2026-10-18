import { provideHttpClient, withInterceptors } from '@angular/common/http';
import {
  HttpTestingController,
  TestRequest,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { Component } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { TranslocoService } from '@jsverse/transloco';
import type {
  AdminPaymentRow,
  BillingInvoice,
  BillingPayment,
} from '@hostelhive/data-access';
import { API_CONFIG } from '@core/api-config';
import { errorInterceptor } from '@core/interceptors/error-interceptor';
import { API_ERROR_NOTIFIER, SUPPRESS_ERROR_TOAST } from '@core/tokens';
import { provideI18nTesting } from '@core/i18n/provide-i18n-testing';
import {
  AdminPaymentDrawer,
  type AdminPaymentOutcome,
} from './admin-payment-drawer';

const BASE = 'https://api.test';

const COPY = {
  adminBilling: {
    invoices: { title: 'Invoice {{number}}' },
    common: {
      proofView: 'View proof',
      proofNone: 'No proof attached',
      loadError: "We couldn't load this. Try again.",
      retry: 'Try again',
      close: 'Close',
      cancel: 'Cancel',
      datesUtc: 'Dates are in UTC.',
    },
    fields: { verifiedAt: 'Verified at', verifiedBy: 'Verified by' },
    errors: {
      forbidden: 'Only HostelHive admins can see billing.',
      notFound: 'This was changed or removed.',
      generic: 'Something went wrong. Try again.',
      network: "We couldn't reach HostelHive.",
    },
    paymentStatus: {
      awaiting: 'Awaiting verification',
      succeeded: 'Succeeded',
      failed: 'Failed',
    },
    method: { bankTransfer: 'Bank transfer', safepay: 'Safepay' },
    refund: {
      badge: 'Refund needed',
      body: 'Refund it from the Safepay dashboard using tracker {{tracker}}.',
    },
    verification: {
      verify: 'Verify',
      reject: 'Reject',
      verifyTitle: 'Verify this bank transfer?',
      verifyMessage:
        'Only verify once {{amount}} with reference {{reference}} has reached us. Invoice {{number}} is marked paid.',
      verifyMessageNoReference:
        'Only verify once {{amount}} has reached us. Invoice {{number}} is marked paid.',
      verifyConfirm: 'Verify payment',
      verifyNotApplied: "This payment wasn't applied: {{reason}}",
      verifyNotAppliedNext: 'The host has been emailed the reason.',
      rejectTitle: 'Reject this bank transfer?',
      rejectReasonLabel: 'Reason',
      rejectHint: 'The host is emailed this reason.',
      rejectReasonRequired: 'Enter a reason.',
      rejectReasonTooLong: 'Keep the reason under 500 characters.',
      rejectConfirm: 'Reject payment',
    },
  },
};

const ROW: AdminPaymentRow = {
  id: 'pAy9X',
  hostel_id: 'hOs3L',
  invoice_id: 'iNv7Q',
  payment_method: 'bank_transfer',
  currency: 'PKR',
  amount: '5250.00',
  reference: 'TRX-8812',
  gateway_reference: null,
  failure_reason: null,
  verified_at: null,
  succeeded_at: null,
  created_at: '2026-10-09T07:15:00Z',
  verified_by: null,
  invoice: {
    id: 'iNv7Q',
    number: 'HH-2026-000123',
    kind: 'new',
    status: 'open',
    plan: { code: 'crm', name: 'Listing + CRM' },
  },
  hostel: { id: 'hOs3L', name: 'Gulberg Heights' },
  status: {
    id: 2,
    name: 'Awaiting verification',
    slug: 'awaiting-verification',
  },
};

function payment(over: Partial<BillingPayment> = {}): BillingPayment {
  return {
    id: 'pAy9X',
    status: {
      id: 2,
      name: 'Awaiting verification',
      slug: 'awaiting-verification',
    },
    payment_method: 'bank_transfer',
    amount: '5250.00',
    currency: 'PKR',
    reference: 'TRX-8812',
    gateway_reference: null,
    failure_reason: null,
    proof_url: 'https://files.test/proof-8812.png',
    verified_at: null,
    succeeded_at: null,
    created_at: '2026-10-09T07:15:00Z',
    invoice_id: 'iNv7Q',
    initiated_by: 'customer',
    ...over,
  };
}

function invoice(payments: BillingPayment[]): BillingInvoice {
  return {
    id: 'iNv7Q',
    number: 'HH-2026-000123',
    kind: 'new',
    currency: 'PKR',
    total: '4999.00',
    period_start: null,
    period_end: null,
    expires_at: '2026-10-14T09:00:00Z',
    paid_at: null,
    voided_at: null,
    created_at: '2026-10-09T07:00:00Z',
    invoice_pdf_url: null,
    plan: {
      id: 'pLnCr',
      code: 'crm',
      name: 'Listing + CRM',
      features: ['crm'],
    },
    lines: [{ description: 'Listing + CRM, 1 month', amount: '4999.00' }],
    status: { id: 1, name: 'Open', slug: 'open' },
    payments,
  };
}

function envelope(p: BillingPayment, others: BillingPayment[] = []) {
  return { payment: p, invoice: invoice([...others, p]), success: true };
}

const OLDER_ATTEMPT = payment({
  id: 'pOld1',
  payment_method: 'safepay',
  amount: '4999.00',
  reference: null,
  proof_url: null,
  status: { id: 4, name: 'Failed', slug: 'failed' },
  created_at: '2026-10-08T10:00:00Z',
});

@Component({ template: '' })
class Blank {}

function text(el: Element | null | undefined): string {
  return (el?.textContent ?? '').replace(/\s+/g, ' ').trim();
}

describe('AdminPaymentDrawer', () => {
  let fixture: ComponentFixture<AdminPaymentDrawer>;
  let http: HttpTestingController;
  let outcomes: AdminPaymentOutcome[];
  let closes: number;

  async function render(row: AdminPaymentRow = ROW): Promise<HTMLElement> {
    TestBed.configureTestingModule({
      providers: [
        provideRouter([{ path: '**', component: Blank }]),
        provideI18nTesting(),
        provideHttpClient(withInterceptors([errorInterceptor])),
        provideHttpClientTesting(),
        { provide: API_CONFIG, useValue: { baseUrl: BASE } },
        { provide: API_ERROR_NOTIFIER, useValue: vi.fn() },
      ],
    });
    TestBed.inject(TranslocoService).setTranslation(COPY, 'en');
    await TestBed.inject(Router).navigateByUrl('/en/admin/billing/verification');
    http = TestBed.inject(HttpTestingController);
    fixture = TestBed.createComponent(AdminPaymentDrawer);
    outcomes = [];
    closes = 0;
    fixture.componentInstance.handled.subscribe((o) => outcomes.push(o));
    fixture.componentInstance.closed.subscribe(() => closes++);
    fixture.componentRef.setInput('row', row);
    fixture.detectChanges();
    return el();
  }

  function el(): HTMLElement {
    return fixture.nativeElement as HTMLElement;
  }

  async function settle(): Promise<void> {
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
  }

  const detailRequest = (): TestRequest =>
    http.expectOne(`${BASE}/api/admin/payments/pAy9X`);

  async function loaded(
    p: BillingPayment = payment(),
    others: BillingPayment[] = [OLDER_ATTEMPT],
  ): Promise<HTMLElement> {
    detailRequest().flush(envelope(p, others));
    await settle();
    return el();
  }

  const q = (sel: string) => el().querySelector<HTMLElement>(sel);
  const field = (name: string) => text(q(`[data-field="${name}"]`));
  const button = (id: string) =>
    q(`[data-testid="${id}"]`) as HTMLButtonElement | null;

  /** The dialog's own confirm button: the last one, after the backdrop and Cancel. */
  function confirmOf(dialog: string): HTMLButtonElement {
    const buttons = el().querySelectorAll<HTMLButtonElement>(
      `[data-testid="${dialog}"] button`,
    );
    return buttons[buttons.length - 1];
  }

  afterEach(() => {
    try {
      http?.verify();
    } finally {
      TestBed.resetTestingModule();
    }
  });

  it('fetches the payment quietly and shows its fields, the hostel from the row', async () => {
    await render();
    const req = detailRequest();
    expect(req.request.method).toBe('GET');
    expect(req.request.context.get(SUPPRESS_ERROR_TOAST)).toBe(true);
    expect(q('[data-testid="detail-loading"]')).not.toBeNull();

    req.flush(envelope(payment(), [OLDER_ATTEMPT]));
    await settle();

    expect(field('amount')).toBe('PKR 5,250');
    expect(field('status')).toBe('Awaiting verification');
    expect(field('hostel')).toBe('Gulberg Heights');
    expect(field('invoice')).toBe('HH-2026-000123');
    expect(field('plan')).toBe('Listing + CRM');
    expect(field('method')).toBe('Bank transfer');
    expect(field('reference')).toBe('TRX-8812');
    expect(field('submitted')).toBe('9 Oct 2026, 07:15');
    expect(text(el())).toContain('Dates are in UTC.');
    // The invoice total is shown as the server sent it, next to the payment amount; nothing compares them.
    expect(text(q('hh-invoice-summary [data-field="total"]'))).toContain(
      'PKR 4,999',
    );
    const attempts = el().querySelectorAll('[data-testid="attempt"]');
    expect(attempts).toHaveLength(1);
    expect(text(attempts[0])).toContain('Safepay');
  });

  it('links the hostel billing page with the hostel in router state, and the invoice by id', async () => {
    await render();
    await loaded();
    const router = TestBed.inject(Router);
    const navigate = vi.spyOn(router, 'navigateByUrl');

    const hostel = q('[data-testid="hostel-link"]') as HTMLAnchorElement;
    expect(hostel.getAttribute('href')).toBe(
      '/en/admin/billing/hostels/hOs3L',
    );
    hostel.click();
    expect(navigate.mock.calls[0][1]?.state).toEqual({
      hostel: { id: 'hOs3L', name: 'Gulberg Heights' },
    });

    const inv = q('[data-testid="invoice-link"]') as HTMLAnchorElement;
    expect(inv.getAttribute('href')).toBe(
      '/en/admin/billing/invoices?invoice=iNv7Q',
    );
  });

  it('opens the proof in a new tab without an opener', async () => {
    await render();
    await loaded();

    const proof = q('[data-testid="proof-link"]') as HTMLAnchorElement;
    expect(proof.getAttribute('href')).toBe('https://files.test/proof-8812.png');
    expect(proof.getAttribute('target')).toBe('_blank');
    expect(proof.getAttribute('rel')).toBe('noopener noreferrer');
    expect(text(proof)).toBe('View proof');
  });

  it('says so when there is no proof', async () => {
    await render();
    await loaded(payment({ proof_url: null }));

    expect(q('[data-testid="proof-link"]')).toBeNull();
    expect(text(q('[data-testid="proof-none"]'))).toBe('No proof attached');
  });

  it('verifies only after the confirm, and reports a payment that succeeded', async () => {
    await render();
    await loaded();

    button('verify')!.click();
    await settle();
    expect(http.match(() => true)).toHaveLength(0);
    expect(text(q('[data-testid="verify-dialog"]'))).toContain(
      'Only verify once ⁨PKR 5,250⁩ with reference TRX-8812 has reached us. Invoice HH-2026-000123 is marked paid.',
    );

    confirmOf('verify-dialog').click();
    await settle();
    const req = http.expectOne(`${BASE}/api/admin/payments/pAy9X/verify`);
    expect(req.request.method).toBe('PUT');
    expect(req.request.body).toEqual({});
    expect(req.request.context.get(SUPPRESS_ERROR_TOAST)).toBe(true);
    // One action at a time: both are disabled while the request is out.
    expect(button('verify')!.disabled).toBe(true);
    expect(button('reject')!.disabled).toBe(true);

    const done = payment({
      status: { id: 3, name: 'Succeeded', slug: 'succeeded' },
      verified_at: '2026-10-11T08:00:00Z',
      succeeded_at: '2026-10-11T08:00:00Z',
    });
    req.flush(envelope(done));
    await settle();

    expect(outcomes).toHaveLength(1);
    expect(outcomes[0]).toMatchObject({ paymentId: 'pAy9X', result: 'verified' });
    expect(outcomes[0].detail?.payment).toEqual(done);
    expect(field('status')).toBe('Succeeded');
    expect(button('verify')).toBeNull();
    expect(q('[data-testid="not-applied"]')).toBeNull();
  });

  it('uses the message without a reference when the transfer has none', async () => {
    await render({ ...ROW, reference: null });
    await loaded(payment({ reference: null }));

    button('verify')!.click();
    await settle();

    expect(text(q('[data-testid="verify-dialog"]'))).toContain(
      'Only verify once ⁨PKR 5,250⁩ has reached us. Invoice HH-2026-000123 is marked paid.',
    );
    confirmOf('verify-dialog').click();
    await settle();
    http.expectOne(`${BASE}/api/admin/payments/pAy9X/verify`).flush(
      envelope(payment({ status: { id: 3, name: 'Succeeded', slug: 'succeeded' } })),
    );
    await settle();
  });

  it('shows the failure reason verbatim when a 200 verify did not apply, and stays open', async () => {
    await render();
    await loaded();
    button('verify')!.click();
    await settle();
    confirmOf('verify-dialog').click();
    await settle();

    const reason = 'Amount 5250.00 does not match invoice total 4999.00';
    http
      .expectOne(`${BASE}/api/admin/payments/pAy9X/verify`)
      .flush(
        envelope(
          payment({
            status: { id: 4, name: 'Failed', slug: 'failed' },
            failure_reason: reason,
          }),
        ),
      );
    await settle();

    const alert = q('[data-testid="not-applied"]');
    expect(alert?.getAttribute('role')).toBe('alert');
    expect(text(alert)).toBe(
      `This payment wasn't applied: ${reason} The host has been emailed the reason.`,
    );
    expect(outcomes.map((o) => o.result)).toEqual(['not-applied']);
    expect(closes).toBe(0);
    expect(field('status')).toBe('Failed');
    expect(field('failure-reason')).toBe(reason);
  });

  it('refetches when a 200 verify leaves the payment in any other state', async () => {
    await render();
    await loaded();
    button('verify')!.click();
    await settle();
    confirmOf('verify-dialog').click();
    await settle();

    http
      .expectOne(`${BASE}/api/admin/payments/pAy9X/verify`)
      .flush(envelope(payment()));
    await settle();

    expect(outcomes).toEqual([]);
    detailRequest().flush(envelope(payment()));
    await settle();
  });

  it('keeps Reject disabled until the trimmed reason is there and within 500 characters', async () => {
    await render();
    await loaded();
    button('reject')!.click();
    await settle();

    const confirm = () => confirmOf('reject-dialog');
    const reason = q('[data-testid="reject-reason"]') as HTMLTextAreaElement;
    expect(text(q('[data-testid="reject-dialog"]'))).toContain(
      'The host is emailed this reason.',
    );
    expect(confirm().disabled).toBe(true);

    reason.value = '    ';
    reason.dispatchEvent(new Event('input'));
    await settle();
    expect(confirm().disabled).toBe(true);
    expect(text(q('[data-testid="reject-reason-error"]'))).toBe(
      'Enter a reason.',
    );

    reason.value = 'x'.repeat(501);
    reason.dispatchEvent(new Event('input'));
    await settle();
    expect(confirm().disabled).toBe(true);
    expect(text(q('[data-testid="reject-reason-error"]'))).toBe(
      'Keep the reason under 500 characters.',
    );

    reason.value = `  ${'y'.repeat(500)}  `;
    reason.dispatchEvent(new Event('input'));
    await settle();
    expect(confirm().disabled).toBe(false);
    expect(q('[data-testid="reject-reason-error"]')).toBeNull();
  });

  it('sends the trimmed reason and reports the rejection', async () => {
    await render();
    await loaded();
    button('reject')!.click();
    await settle();
    const reason = q('[data-testid="reject-reason"]') as HTMLTextAreaElement;
    reason.value = '  Transfer never arrived in the account  ';
    reason.dispatchEvent(new Event('input'));
    await settle();

    confirmOf('reject-dialog').click();
    await settle();
    const req = http.expectOne(`${BASE}/api/admin/payments/pAy9X/reject`);
    expect(req.request.method).toBe('PUT');
    expect(req.request.body).toEqual({
      reason: 'Transfer never arrived in the account',
    });
    expect(req.request.context.get(SUPPRESS_ERROR_TOAST)).toBe(true);

    req.flush(
      envelope(
        payment({
          status: { id: 4, name: 'Failed', slug: 'failed' },
          failure_reason: 'Transfer never arrived in the account',
        }),
      ),
    );
    await settle();

    expect(outcomes.map((o) => o.result)).toEqual(['rejected']);
    expect(q('[data-testid="reject-dialog"]')).toBeNull();
  });

  it('shows a 422 verbatim, reports the payment stale, and refetches it', async () => {
    await render();
    await loaded();
    button('verify')!.click();
    await settle();
    confirmOf('verify-dialog').click();
    await settle();

    http
      .expectOne(`${BASE}/api/admin/payments/pAy9X/verify`)
      .flush(
        {
          success: false,
          errors: ['Only a payment awaiting verification can be verified'],
        },
        { status: 422, statusText: 'Unprocessable Entity' },
      );
    await settle();

    expect(text(q('[data-testid="action-error"]'))).toBe(
      'Only a payment awaiting verification can be verified',
    );
    expect(outcomes).toEqual([
      { paymentId: 'pAy9X', result: 'stale', detail: null },
    ]);

    detailRequest().flush(
      envelope(
        payment({ status: { id: 3, name: 'Succeeded', slug: 'succeeded' } }),
      ),
    );
    await settle();
    expect(field('status')).toBe('Succeeded');
    expect(text(q('[data-testid="action-error"]'))).toBe(
      'Only a payment awaiting verification can be verified',
    );
    expect(button('verify')).toBeNull();
  });

  it('shows a 404 on verify as not found, reports the payment stale, and refetches it', async () => {
    await render();
    await loaded();
    button('verify')!.click();
    await settle();
    confirmOf('verify-dialog').click();
    await settle();

    http
      .expectOne(`${BASE}/api/admin/payments/pAy9X/verify`)
      .flush(
        { success: false, errors: ["Couldn't find Payment"] },
        { status: 404, statusText: 'Not Found' },
      );
    await settle();

    expect(text(q('[data-testid="action-error"]'))).toBe(
      'This was changed or removed.',
    );
    expect(outcomes).toEqual([
      { paymentId: 'pAy9X', result: 'stale', detail: null },
    ]);
    expect(q('[data-testid="detail-loading"]')).not.toBeNull();
    detailRequest().flush(
      envelope(
        payment({ status: { id: 3, name: 'Succeeded', slug: 'succeeded' } }),
      ),
    );
    await settle();
    expect(field('status')).toBe('Succeeded');
    expect(button('verify')).toBeNull();
  });

  it('shows a 404 on reject as not found, reports the payment stale, and refetches it', async () => {
    await render();
    await loaded();
    button('reject')!.click();
    await settle();
    const reason = q('[data-testid="reject-reason"]') as HTMLTextAreaElement;
    reason.value = 'Nothing arrived';
    reason.dispatchEvent(new Event('input'));
    await settle();
    confirmOf('reject-dialog').click();
    await settle();

    http
      .expectOne(`${BASE}/api/admin/payments/pAy9X/reject`)
      .flush(
        { success: false, errors: ["Couldn't find Payment"] },
        { status: 404, statusText: 'Not Found' },
      );
    await settle();

    expect(text(q('[data-testid="action-error"]'))).toBe(
      'This was changed or removed.',
    );
    expect(outcomes).toEqual([
      { paymentId: 'pAy9X', result: 'stale', detail: null },
    ]);
    detailRequest().flush(
      envelope(payment({ status: { id: 4, name: 'Failed', slug: 'failed' } })),
    );
    await settle();
    expect(field('status')).toBe('Failed');
    expect(button('reject')).toBeNull();
  });

  it('shows a 422 on reject verbatim and reports the payment stale', async () => {
    await render();
    await loaded();
    button('reject')!.click();
    await settle();
    const reason = q('[data-testid="reject-reason"]') as HTMLTextAreaElement;
    reason.value = 'Nothing arrived';
    reason.dispatchEvent(new Event('input'));
    await settle();
    confirmOf('reject-dialog').click();
    await settle();

    http
      .expectOne(`${BASE}/api/admin/payments/pAy9X/reject`)
      .flush(
        {
          success: false,
          errors: ['Only a payment awaiting verification can be rejected'],
        },
        { status: 422, statusText: 'Unprocessable Entity' },
      );
    await settle();

    expect(text(q('[data-testid="action-error"]'))).toBe(
      'Only a payment awaiting verification can be rejected',
    );
    expect(outcomes).toEqual([
      { paymentId: 'pAy9X', result: 'stale', detail: null },
    ]);
    detailRequest().flush(
      envelope(payment({ status: { id: 4, name: 'Failed', slug: 'failed' } })),
    );
    await settle();
    expect(field('status')).toBe('Failed');
  });

  it('shows when a succeeded payment was verified and by whom', async () => {
    await render({
      ...ROW,
      verified_by: { id: 'aDm1N', name: 'Sana Qureshi' },
      verified_at: '2026-10-11T14:05:00Z',
      status: { id: 3, name: 'Succeeded', slug: 'succeeded' },
    });
    await loaded(
      payment({
        status: { id: 3, name: 'Succeeded', slug: 'succeeded' },
        verified_at: '2026-10-11T14:05:00Z',
        succeeded_at: '2026-10-11T14:05:00Z',
      }),
    );

    expect(field('verified-at')).toBe('11 Oct 2026, 14:05');
    expect(field('verified-by')).toBe('Sana Qureshi');
    expect(text(el())).toContain('Verified at');
    expect(text(el())).toContain('Verified by');
  });

  it('shows no verifier lines on a payment nobody verified', async () => {
    await render();
    await loaded();

    expect(q('[data-field="verified-at"]')).toBeNull();
    expect(q('[data-field="verified-by"]')).toBeNull();
  });

  it('shows our own copy on a 403, whatever the server said, and does not refetch', async () => {
    await render();
    await loaded();
    button('verify')!.click();
    await settle();
    confirmOf('verify-dialog').click();
    await settle();

    http
      .expectOne(`${BASE}/api/admin/payments/pAy9X/verify`)
      .flush(
        { success: false, errors: ['You are not authorized'] },
        { status: 403, statusText: 'Forbidden' },
      );
    await settle();

    expect(text(q('[data-testid="action-error"]'))).toBe(
      'Only HostelHive admins can see billing.',
    );
    expect(outcomes).toEqual([]);
    expect(button('verify')!.disabled).toBe(false);
  });

  it('cannot be closed while an action is in flight', async () => {
    await render();
    await loaded();
    button('verify')!.click();
    await settle();
    confirmOf('verify-dialog').click();
    await settle();

    q('hh-drawer button[aria-label]')!.click();
    expect(closes).toBe(0);

    http
      .expectOne(`${BASE}/api/admin/payments/pAy9X/verify`)
      .flush(
        envelope(
          payment({ status: { id: 3, name: 'Succeeded', slug: 'succeeded' } }),
        ),
      );
    await settle();
    q('hh-drawer button[aria-label]')!.click();
    expect(closes).toBe(1);
  });

  it('offers no actions on a payment that is not awaiting verification, and flags a refund', async () => {
    const reason =
      'Invoice HH-2026-000123 was voided. Charged at Safepay; refund it from the Safepay dashboard';
    const failed: AdminPaymentRow = {
      ...ROW,
      payment_method: 'safepay',
      reference: null,
      gateway_reference: 'trk_51Ab',
      failure_reason: reason,
      status: { id: 4, name: 'Failed', slug: 'failed' },
    };
    await render(failed);
    await loaded(
      payment({
        payment_method: 'safepay',
        reference: null,
        gateway_reference: 'trk_51Ab',
        failure_reason: reason,
        proof_url: null,
        status: { id: 4, name: 'Failed', slug: 'failed' },
      }),
    );

    expect(button('verify')).toBeNull();
    expect(button('reject')).toBeNull();
    expect(button('close')).not.toBeNull();
    expect(text(q('[data-field="refund-badge"]'))).toBe('Refund needed');
    expect(text(q('[data-testid="refund-note"]'))).toBe(
      'Refund it from the Safepay dashboard using tracker trk_51Ab.',
    );
    expect(field('failure-reason')).toBe(reason);
    expect(field('tracker')).toBe('trk_51Ab');
    expect(field('reference')).toBe('—');

    button('close')!.click();
    expect(closes).toBe(1);
  });

  it('shows our own copy when the detail is forbidden, with no retry', async () => {
    await render();
    detailRequest().flush(
      { errors: ['nope'] },
      { status: 403, statusText: 'Forbidden' },
    );
    await settle();

    expect(text(q('[data-testid="detail-forbidden"]'))).toBe(
      'Only HostelHive admins can see billing.',
    );
    expect(q('[data-testid="detail-error"]')).toBeNull();
    expect(button('verify')).toBeNull();
  });

  it('says the payment is gone with no retry when the detail is not found, and reports it stale', async () => {
    await render();
    detailRequest().flush(
      { success: false, errors: ["Couldn't find Payment"] },
      { status: 404, statusText: 'Not Found' },
    );
    await settle();

    const notFound = q('[data-testid="detail-not-found"]');
    expect(text(notFound)).toBe('This was changed or removed.');
    expect(notFound?.querySelector('button')).toBeNull();
    expect(q('[data-testid="detail-error"]')).toBeNull();
    expect(button('verify')).toBeNull();
    expect(outcomes).toEqual([
      { paymentId: 'pAy9X', result: 'stale', detail: null },
    ]);
  });

  it('reports a payment gone once, and says so once, when the refetch after a 404 action also 404s', async () => {
    await render();
    await loaded();
    button('verify')!.click();
    await settle();
    confirmOf('verify-dialog').click();
    await settle();
    http
      .expectOne(`${BASE}/api/admin/payments/pAy9X/verify`)
      .flush(
        { success: false, errors: ["Couldn't find Payment"] },
        { status: 404, statusText: 'Not Found' },
      );
    await settle();
    detailRequest().flush(
      { success: false, errors: ["Couldn't find Payment"] },
      { status: 404, statusText: 'Not Found' },
    );
    await settle();

    expect(outcomes).toEqual([
      { paymentId: 'pAy9X', result: 'stale', detail: null },
    ]);
    expect(q('[data-testid="action-error"]')).toBeNull();
    expect(text(q('[data-testid="detail-not-found"]'))).toBe(
      'This was changed or removed.',
    );
  });

  it('offers a retry when the detail fails to load', async () => {
    await render();
    detailRequest().flush('boom', {
      status: 500,
      statusText: 'Server Error',
    });
    await settle();

    const error = q('[data-testid="detail-error"]');
    expect(text(error)).toContain("We couldn't load this. Try again.");
    (error!.querySelector('button') as HTMLButtonElement).click();
    await settle();

    await loaded();
    expect(field('status')).toBe('Awaiting verification');
    expect(button('verify')).not.toBeNull();
  });
});
