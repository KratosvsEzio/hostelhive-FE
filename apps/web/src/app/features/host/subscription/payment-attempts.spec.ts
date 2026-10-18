import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { TranslocoService } from '@jsverse/transloco';
import type { BillingPayment } from '@hostelhive/data-access';
import { provideI18nTesting } from '@core/i18n/provide-i18n-testing';
import { PaymentAttempts } from './payment-attempts';

const COPY = {
  hostPayment: {
    chargedNotApplied: 'Contact us and quote invoice {{number}}.',
  },
  hostBillingHistory: {
    attemptsTitle: 'Payment attempts',
    noAttempts: 'No payment attempts yet.',
    attemptFailed: "This payment didn't go through.",
    attemptCharged: 'Payment taken, not applied',
    methodSafepay: 'Safepay',
    methodBankTransfer: 'Bank transfer',
    methodCash: 'Cash',
    methodAdminGrant: 'Granted by HostelHive',
    methodOther: 'Other',
    initiatedSchedule: 'Charged automatically',
    initiatedUpgrade: 'Saved card',
    paymentPending: 'Pending',
    paymentReview: 'Under review',
    paymentSucceeded: 'Successful',
    paymentFailed: 'Failed',
  },
  common: { contactUs: 'Contact us' },
};

const REFUND_WORDING =
  'Charged at Safepay but invoice was void; refund it from the Safepay dashboard';

function status(slug: string, name = slug) {
  return { id: 1, name, slug, color: null };
}

function payment(over: Partial<BillingPayment> = {}): BillingPayment {
  return {
    id: 'pay1',
    status: status('succeeded', 'Succeeded'),
    payment_method: 'safepay',
    amount: '5000',
    currency: 'PKR',
    reference: null,
    gateway_reference: null,
    failure_reason: null,
    proof_url: null,
    verified_at: null,
    succeeded_at: null,
    created_at: '2026-10-11T09:05:00+05:00',
    invoice_id: 'inv0Ab',
    initiated_by: 'customer',
    ...over,
  };
}

describe('PaymentAttempts', () => {
  let fixture: ComponentFixture<PaymentAttempts>;

  function render(
    payments: BillingPayment[],
    number = 'HH-2026-0007',
  ): HTMLElement {
    TestBed.configureTestingModule({
      providers: [provideRouter([]), provideI18nTesting()],
    });
    TestBed.inject(TranslocoService).setTranslation(COPY, 'en');
    fixture = TestBed.createComponent(PaymentAttempts);
    fixture.componentRef.setInput('payments', payments);
    fixture.componentRef.setInput('invoiceNumber', number);
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

  it('is headed by its title', () => {
    const el = render([]);

    expect(el.querySelector('h2')?.textContent?.trim()).toBe(
      'Payment attempts',
    );
  });

  it('says so when there are no attempts', () => {
    const el = render([]);

    expect(rows(el)).toHaveLength(0);
    expect(
      el.querySelector('[data-testid="no-attempts"]')?.textContent?.trim(),
    ).toBe('No payment attempts yet.');
  });

  it('lists newest first without reordering the input', () => {
    const payments = [
      payment({ id: 'a', amount: '1000' }),
      payment({ id: 'b', amount: '2000' }),
      payment({ id: 'c', amount: '3000' }),
    ];
    const el = render(payments);

    expect(rows(el).map((r) => field(r, 'amount'))).toEqual([
      'PKR 3,000',
      'PKR 2,000',
      'PKR 1,000',
    ]);
    expect(payments.map((p) => p.id)).toEqual(['a', 'b', 'c']);
  });

  it('labels each known method and calls anything else Other', () => {
    const el = render([
      payment({ id: '1', payment_method: 'safepay' }),
      payment({ id: '2', payment_method: 'bank_transfer' }),
      payment({ id: '3', payment_method: 'cash' }),
      payment({ id: '4', payment_method: 'admin_grant' }),
      payment({ id: '5', payment_method: 'crypto_wallet' }),
    ]);

    expect(rows(el).map((r) => field(r, 'method'))).toEqual([
      'Other',
      'Granted by HostelHive',
      'Cash',
      'Bank transfer',
      'Safepay',
    ]);
    expect(el.textContent).not.toContain('crypto_wallet');
  });

  it('tags a scheduled charge and a saved-card charge next to the method', () => {
    const el = render([
      payment({ id: '1', initiated_by: 'schedule' }),
      payment({ id: '2', initiated_by: 'upgrade' }),
    ]);

    expect(rows(el).map((r) => field(r, 'initiator'))).toEqual([
      'Saved card',
      'Charged automatically',
    ]);
    expect(rows(el).map((r) => field(r, 'method'))).toEqual([
      'Safepay',
      'Safepay',
    ]);
  });

  it('adds no tag for a customer, missing or unknown initiator', () => {
    const missing = payment({ id: '3' });
    delete (missing as Partial<BillingPayment>).initiated_by;
    const el = render([
      payment({ id: '1', initiated_by: 'customer' }),
      payment({ id: '2', initiated_by: 'robot' }),
      missing,
      payment({ id: '4', initiated_by: 'constructor' }),
    ]);

    expect(rows(el)).toHaveLength(4);
    expect(el.querySelector('[data-field="initiator"]')).toBeNull();
  });

  it('shows each amount in its own currency inside <bdi>', () => {
    const el = render([
      payment({ id: '1', amount: '5000', currency: 'PKR' }),
      payment({ id: '2', amount: '18', currency: 'USD' }),
    ]);

    const amounts = rows(el).map((r) =>
      r.querySelector('[data-field="amount"] bdi')?.textContent?.trim(),
    );
    expect(amounts).toEqual(['$18', 'PKR 5,000']);
  });

  it('labels and tones each known status, and falls back to the server name', () => {
    const el = render([
      payment({ id: '1', status: status('pending', 'Pending') }),
      payment({ id: '2', status: status('awaiting-verification', 'Awaiting') }),
      payment({ id: '3', status: status('succeeded', 'Succeeded') }),
      payment({ id: '4', status: status('failed', 'Failed') }),
      payment({ id: '5', status: status('reversed', 'Reversed by bank') }),
    ]);

    const pills = rows(el).map(
      (r) => r.querySelector('hh-status-pill') as HTMLElement,
    );
    expect(pills.map((p) => p.textContent?.trim())).toEqual([
      'Reversed by bank',
      'Failed',
      'Successful',
      'Under review',
      'Pending',
    ]);
    expect(pills[0].className).toContain('bg-ink-100');
    expect(pills[1].className).toContain('text-danger');
    expect(pills[2].className).toContain('text-ok');
    expect(pills[3].className).toContain('text-warn');
    expect(pills[4].className).toContain('text-warn');
  });

  it('uses our label and tone for a status even when the server names it differently', () => {
    const el = render([
      payment({ id: '1', status: status('pending', 'In progress') }),
      payment({ id: '2', status: status('awaiting-verification', 'Queued') }),
      payment({ id: '3', status: status('succeeded', 'Settled') }),
      payment({ id: '4', status: status('failed', 'Declined') }),
    ]);

    const pills = rows(el).map(
      (r) => r.querySelector('hh-status-pill') as HTMLElement,
    );
    expect(pills.map((p) => p.textContent?.trim())).toEqual([
      'Failed',
      'Successful',
      'Under review',
      'Pending',
    ]);
    expect(pills[0].className).toContain('text-danger');
    expect(pills[1].className).toContain('text-ok');
    expect(pills[2].className).toContain('text-warn');
    expect(pills[3].className).toContain('text-warn');
    expect(el.textContent).not.toMatch(/In progress|Queued|Settled|Declined/);
  });

  it('dates an attempt by when it succeeded, else when it was made, date only', () => {
    const el = render([
      payment({
        id: '1',
        created_at: '2026-10-01T23:00:00+05:00',
        succeeded_at: '2026-10-03T08:00:00+05:00',
      }),
      payment({ id: '2', created_at: '2026-10-05T10:15:00+05:00' }),
    ]);

    expect(rows(el).map((r) => field(r, 'date'))).toEqual([
      '5 Oct 2026',
      '3 Oct 2026',
    ]);
  });

  it('gives a plain failed attempt our own neutral note', () => {
    const el = render([
      payment({
        status: status('failed', 'Failed'),
        failure_reason: 'Declined by issuer (code 05)',
      }),
    ]);
    const [row] = rows(el);

    expect(field(row, 'note')).toBe("This payment didn't go through.");
    expect(
      row.querySelector('[data-field="note"]')?.getAttribute('data-tone'),
    ).toBe('neutral');
    expect(row.querySelector('[data-testid="contact-us"]')).toBeNull();
    expect(el.textContent).not.toContain('Declined by issuer');
  });

  it('marks a charged attempt and asks the host to quote the invoice', () => {
    const el = render(
      [
        payment({
          status: status('failed', 'Failed'),
          failure_reason: REFUND_WORDING,
          gateway_reference: 'trk_SECRET_GATEWAY_REF',
        }),
      ],
      'HH-2026-0042',
    );
    const [row] = rows(el);
    const pill = row.querySelector('hh-status-pill') as HTMLElement;

    expect(pill.textContent?.trim()).toBe('Payment taken, not applied');
    expect(pill.className).toContain('text-danger');
    expect(field(row, 'note')).toBe(
      'Contact us and quote invoice HH-2026-0042. Contact us',
    );
    const contact = row.querySelector('[data-testid="contact-us"]');
    expect(contact?.getAttribute('href')).toMatch(/\/contact$/);
  });

  it('adds no note to pending or successful attempts', () => {
    const el = render([
      payment({ id: '1', status: status('pending') }),
      payment({ id: '2', status: status('succeeded') }),
    ]);

    expect(el.querySelector('[data-field="note"]')).toBeNull();
  });

  it('never renders when it was verified, or the payment and invoice ids', () => {
    const el = render([
      payment({
        id: 'payIdSecret',
        invoice_id: 'invIdSecret',
        status: status('succeeded', 'Succeeded'),
        succeeded_at: '2026-10-12T09:00:00+05:00',
        verified_at: '2026-10-14T09:00:00+05:00',
      }),
    ]);
    const html = el.innerHTML;

    expect(field(rows(el)[0], 'date')).toBe('12 Oct 2026');
    for (const hidden of [
      '14 Oct',
      '2026-10-14',
      'payIdSecret',
      'invIdSecret',
    ]) {
      expect(html).not.toContain(hidden);
    }
  });

  it('never converts or adds up an amount', () => {
    const source = readFileSync(
      join(dirname(fileURLToPath(import.meta.url)), 'payment-attempts.ts'),
      'utf8',
    );

    expect(source).not.toMatch(/\bNumber\(|parseFloat|parseInt|total_minor/);
    expect(source).not.toMatch(/\.amount\s*[-+*/]|reduce\(/);
  });

  it('never renders the reason, references, tracker or proof', () => {
    const el = render([
      payment({
        id: '1',
        status: status('failed', 'Failed'),
        failure_reason: REFUND_WORDING,
        reference: 'BANK-REF-SECRET',
        gateway_reference: 'trk_SECRET_GATEWAY_REF',
        proof_url: 'https://cdn.example/proof-SECRET.png',
        verified_at: '2026-10-12T09:00:00+05:00',
      }),
      payment({
        id: '2',
        status: status('failed', 'Failed'),
        failure_reason: 'Declined by issuer',
        reference: 'BANK-REF-2',
        gateway_reference: 'trk_SECOND',
      }),
    ]);
    const html = el.innerHTML;

    for (const secret of [
      'Charged at',
      'BANK-REF',
      'trk_',
      'proof-SECRET',
      'Declined by issuer',
    ]) {
      expect(html).not.toContain(secret);
    }
    expect(html.toLowerCase()).not.toContain('refund');
  });
});
