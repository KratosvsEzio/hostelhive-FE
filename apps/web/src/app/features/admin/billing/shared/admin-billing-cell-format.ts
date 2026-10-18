import { Signal, computed, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { Translation, TranslocoService } from '@jsverse/transloco';
import { AdminUtcDate } from './admin-utc-date';
import { BillingMoneyPipe } from '@app/shared/billing/billing-money.pipe';
import type { AdminBillingCellFormat } from '@util/table-configs/admin-billing-payments-cols';
import { isolate } from './admin-billing-labels';

/** How every admin billing date-time reads; the page notes once that it is UTC. */
export const ADMIN_BILLING_DATE_TIME = 'd MMM yyyy, HH:mm';

/** How an admin billing date with no time of day reads, such as an invoice period. */
export const ADMIN_BILLING_DATE = 'd MMM yyyy';

/**
 * The formatters an admin billing table hands its cells, rebuilt when the language's strings
 * change. Labels are read from the loaded translation rather than through `translate()`, so a
 * column built before the file arrives fills in when it does instead of keeping a blank.
 *
 * Call in an injection context.
 */
export function injectAdminBillingCellFormat(): Signal<AdminBillingCellFormat> {
  const i18n = inject(TranslocoService);
  const money = new BillingMoneyPipe();
  const date = new AdminUtcDate();
  const strings = toSignal(i18n.selectTranslation(), {
    initialValue: {} as Translation,
  });

  return computed<AdminBillingCellFormat>(() => {
    const loaded = strings();
    return {
      label: (key) => {
        const value = loaded[key];
        return typeof value === 'string' ? value : '';
      },
      money: (amount, currency) => isolate(money.transform(amount, currency)),
      dateTime: (value) => date.transform(value, ADMIN_BILLING_DATE_TIME),
      date: (value) => date.transform(value, ADMIN_BILLING_DATE),
    };
  });
}
