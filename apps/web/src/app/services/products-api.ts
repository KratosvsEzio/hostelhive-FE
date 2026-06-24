import { Injectable, inject } from '@angular/core';
import { Observable, map } from 'rxjs';
import { Product, ProductsResponse } from '@hostelhive/data-access';
import { ApiClient } from '@core/api-resource';

@Injectable({ providedIn: 'root' })
export class ProductsApi {
  private readonly api = inject(ApiClient);

  /** GET /api/products — listing products with their prices. */
  list(): Observable<Product[]> {
    return this.api
      .get<ProductsResponse>('/public/products')
      .pipe(map((r) => r.products ?? []));
  }
}
