import { Injectable, signal } from '@angular/core';
import {
  DEFAULT_PRICING_PERIOD,
  Price,
  PricingPeriod,
} from '@util/pricing-period';

/** Shared signal for the capacity the user has selected in the search bar.
 *  Listing cards and map pins read this to compute the displayed price client-side
 *  without triggering a new API call. */
@Injectable({ providedIn: 'root' })
export class SearchCapacity {
  readonly active = signal<string>('');

  /**
   * The price to show for a listing, with the unit it is quoted in.
   *
   * Returns a `Price` rather than a bare number so the unit reaches the renderer. Every
   * caller previously appended its own `/mo`, which is why a nightly rate would have been
   * mislabelled at five separate call sites. `period` defaults to monthly — what the whole
   * app assumed before backpacker beds existed — so behaviour is unchanged until the
   * backend starts supplying it.
   */
  priceFor(
    priceByCapacity: Record<string, number> | undefined,
    priceFrom: number,
    period: PricingPeriod = DEFAULT_PRICING_PERIOD,
  ): Price {
    const cap = this.active();
    const amount =
      cap && priceByCapacity?.[cap] != null ? priceByCapacity[cap] : priceFrom;
    return { amount, period };
  }
}
