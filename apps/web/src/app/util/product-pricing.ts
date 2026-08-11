import { Product } from '@hostelhive/data-access';
import { SubscriptionPayment as Payment } from './models/subscription';

export const DISCOUNT_PURCHASE_LIMIT = 3;

export function countPaidListingPurchases(payments: Payment[]): number {
  return payments.filter(
    (p) => p.status === 'paid' && p.products.some((pr) => pr.name === 'Listing'),
  ).length;
}

export function hasListingDiscount(product: Product, paidListingCount: number): boolean {
  if (product.product_type !== 'subscription') return false;
  const dp = +(product.discounted_price ?? 0);
  return dp > 0 && paidListingCount < DISCOUNT_PURCHASE_LIMIT;
}

export function effectivePrice(product: Product, paidListingCount: number): number {
  if (hasListingDiscount(product, paidListingCount)) {
    return +(product.discounted_price ?? 0);
  }
  return +product.price;
}
