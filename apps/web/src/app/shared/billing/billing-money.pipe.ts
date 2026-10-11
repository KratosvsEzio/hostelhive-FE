import { Pipe, PipeTransform } from '@angular/core';
import { MoneyPipe } from '@app/shared/currency/money.pipe';

/**
 * A HostelHive plan or invoice amount with its currency: `$18`, `$18.50`, `PKR 5,000`.
 *
 * Billing names the currency by its code because a host is charged in it, whereas hostel and
 * room prices elsewhere keep the `Rs` symbol from `currencySym`. Only USD takes a symbol.
 * The digits are exactly what `money` renders, so grouping and decimals match the rest of the
 * app and nothing is calculated. Returns a plain string; callers wrap it in `<bdi>` so an RTL
 * page keeps the code and the digits together.
 */
@Pipe({ name: 'billingMoney', standalone: true })
export class BillingMoneyPipe implements PipeTransform {
  private readonly money = new MoneyPipe();

  transform(
    amount: string | null | undefined,
    currency: string | null | undefined,
  ): string {
    // money turns a blank string into 0, which would fabricate a "$0" for a missing amount.
    if (!amount?.trim()) return '';
    const digits = this.money.transform(amount);
    if (!digits) return '';
    if (!currency) return digits;
    return currency === 'USD' ? `$${digits}` : `${currency} ${digits}`;
  }
}
