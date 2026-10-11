import { TestBed } from '@angular/core/testing';
import { LocaleStore } from '@core/i18n/locale-store';
import { MoneyPipe } from '@app/shared/currency/money.pipe';
import { BillingMoneyPipe } from './billing-money.pipe';

function inLocale(locale: string): {
  pipe: BillingMoneyPipe;
  money: MoneyPipe;
} {
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    providers: [{ provide: LocaleStore, useValue: { active: () => locale } }],
  });
  return TestBed.runInInjectionContext(() => ({
    pipe: new BillingMoneyPipe(),
    money: new MoneyPipe(),
  }));
}

/**
 * Billing amounts read as the host is charged: the currency code, or `$` for USD, joined to the
 * same digits `money` renders everywhere else. The amount is formatted, never recalculated.
 */
describe('BillingMoneyPipe', () => {
  let pipe: BillingMoneyPipe;

  beforeEach(() => {
    pipe = inLocale('en').pipe;
  });

  it('names PKR by its code, not the app-wide Rs symbol, and drops whole decimals', () => {
    expect(pipe.transform('5000.00', 'PKR')).toBe('PKR 5,000');
  });

  it('puts the dollar sign straight against a whole USD amount', () => {
    expect(pipe.transform('18.00', 'USD')).toBe('$18');
  });

  it('renders a zero amount as a bare zero in USD and PKR', () => {
    expect(pipe.transform('0.00', 'USD')).toBe('$0');
    expect(pipe.transform('0.00', 'PKR')).toBe('PKR 0');
  });

  it('keeps two decimals when the amount has a fraction', () => {
    expect(pipe.transform('18.50', 'USD')).toBe('$18.50');
  });

  it('prefixes any other currency with its code and a space', () => {
    expect(pipe.transform('1234.5', 'EUR')).toBe('EUR 1,234.50');
  });

  it('renders nothing for a missing amount rather than a bare currency', () => {
    expect(pipe.transform(null, 'PKR')).toBe('');
    expect(pipe.transform(undefined, 'USD')).toBe('');
    expect(pipe.transform('', 'USD')).toBe('');
  });

  it('shows the digits alone when the currency is missing', () => {
    expect(pipe.transform('5000.00', null)).toBe('5,000');
  });

  // The pipe yields text only; the template's <bdi> keeps code and digits as one unit in RTL.
  it('returns a plain string in an RTL locale: the code, a space, then the money digits', () => {
    const { pipe: rtl, money } = inLocale('ar');
    const out = rtl.transform('5000.00', 'PKR');

    expect(out).toBe(`PKR ${money.transform('5000.00')}`);
    expect(out).not.toMatch(/[<>]/);
  });

  it('groups the digits for the reader', () => {
    const { pipe: de } = inLocale('de');
    expect(de.transform('5000.00', 'PKR')).toBe('PKR 5.000');
  });
});
