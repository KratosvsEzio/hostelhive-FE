/** A purchasable listing product returned by GET /public/products. */
export interface Product {
  id: number;
  name: string;
  product_type: 'subscription' | 'add_on';
  /** Price in PKR. Rails serialises decimal as a string; coerce with `+price`. */
  price: string | number;
  /** Discounted price in PKR. `null`/`0` means no discount. */
  discounted_price?: string | number | null;
  description?: string | null;
  /** Duration in days (30 for monthly subscription, 15 for add-ons). */
  duration?: number | null;
  currency?: string | null;
  frequency?: string | null;
  tenant_id?: number | null;
}

export interface ProductsResponse {
  products: Product[];
  success: boolean;
}
