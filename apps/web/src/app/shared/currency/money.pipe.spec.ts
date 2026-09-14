import { TestBed } from '@angular/core/testing';
import { LocaleStore } from '@core/i18n/locale-store';
import { MoneyPipe } from './money.pipe';

/**
 * Decimals follow the amount; grouping follows the reader.
 *
 * The app carries 76 currencies and no minor-unit table, so the two obvious rules are both
 * wrong: a fixed `1.2-2` renders PKR as "Rs 10,000.00", and a fixed `1.0-0` renders USD as
 * "$13" when the price is 12.50. Keying on whether the number has a fraction gets both right
 * without a lookup, which is why this pipe exists rather than a digitsInfo string per call.
 */
function pipeFor(locale: string): MoneyPipe {
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    providers: [{ provide: LocaleStore, useValue: { active: () => locale } }],
  });
  return TestBed.runInInjectionContext(() => new MoneyPipe());
}

describe('MoneyPipe', () => {
  let pipe: MoneyPipe;

  beforeEach(() => (pipe = pipeFor('en')));

  it('drops the decimals a whole amount does not need', () => {
    expect(pipe.transform(10000)).toBe('10,000');
    expect(pipe.transform(1200)).toBe('1,200');
    expect(pipe.transform(0)).toBe('0');
  });

  // "$12.5" is not a price. A fractional amount is always shown to two places.
  it('pads a fractional amount to two places', () => {
    expect(pipe.transform(12.5)).toBe('12.50');
    expect(pipe.transform(0.5)).toBe('0.50');
  });

  it('rounds to two places rather than running on', () => {
    expect(pipe.transform(12.567)).toBe('12.57');
  });

  it('groups thousands', () => {
    expect(pipe.transform(1234567)).toBe('1,234,567');
  });

  // Prices arrive from the API as strings ("12000.0"), and "12000.0" is a whole amount.
  it('accepts the string form the API sends', () => {
    expect(pipe.transform('12000.0')).toBe('12,000');
    expect(pipe.transform('12.5')).toBe('12.50');
  });

  // A missing price must render as nothing, never as "0" — a free bed is not the same
  // claim as an unknown one.
  it('renders nothing at all for a missing or unusable value', () => {
    expect(pipe.transform(null)).toBe('');
    expect(pipe.transform(undefined)).toBe('');
    expect(pipe.transform('not a number')).toBe('');
    expect(pipe.transform(Number.NaN)).toBe('');
    expect(pipe.transform(Number.POSITIVE_INFINITY)).toBe('');
  });

  /**
   * The basket total is a floating-point `reduce`, so three nights at 2,766.67 arrive as
   * 8300.000000000002. Untreated that is not an integer, and the total rendered "8,300.00"
   * directly beneath line items reading "8,300".
   */
  it('treats a float that is a whole number in disguise as whole', () => {
    expect(pipe.transform(8300.000000000002)).toBe('8,300');
    expect(pipe.transform(0.1 + 0.2)).toBe('0.30');
  });

  /**
   * `LOCALE_ID` is never provided in this app and `registerLocaleData` is never called, so
   * Angular's formatter would be pinned to en-US and render "10,000" on the German page —
   * which a German reader parses as ten. The grouping has to follow the language being read.
   */
  describe('grouping follows the active locale', () => {
    it('uses dots for de', () => {
      expect(pipeFor('de').transform(10000)).toBe('10.000');
    });

    it('uses commas for en and ur, which both group the western way', () => {
      expect(pipeFor('en').transform(100000)).toBe('100,000');
      expect(pipeFor('ur').transform(100000)).toBe('100,000');
    });

    it('keeps the fraction rule whatever the locale', () => {
      expect(pipeFor('de').transform(12.5)).toBe('12,50');
    });
  });
});
