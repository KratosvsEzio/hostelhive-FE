import { Injectable, computed, inject, signal } from '@angular/core';
import { Observable, of } from 'rxjs';
import { catchError, map, tap } from 'rxjs/operators';
import { SubscriptionContract as Contract } from '@hostelhive/data-access';
import { SubscriptionApi } from './subscription-api';

@Injectable({ providedIn: 'root' })
export class SubscriptionStore {
  private readonly api = inject(SubscriptionApi);

  readonly contract = signal<Contract | null>(null);
  readonly featuredUntil = signal<string | null>(null);
  readonly status = signal<'idle' | 'loading' | 'ready' | 'error'>('idle');

  private loadedHostelId = '';

  readonly isActive = computed(() => this.contract()?.status === 'active');

  isLoadedFor(hostelId: string): boolean {
    return this.status() === 'ready' && this.loadedHostelId === hostelId;
  }

  load(hostelId: string): Observable<void> {
    if (this.isLoadedFor(hostelId)) return of(void 0);

    this.loadedHostelId = hostelId;
    this.status.set('loading');

    return this.api.currentSubscription(hostelId).pipe(
      tap(({ contract, featuredUntil }) => {
        this.contract.set(contract);
        this.featuredUntil.set(featuredUntil);
        this.status.set('ready');
      }),
      map(() => void 0),
      catchError(() => {
        this.status.set('error');
        return of(void 0);
      }),
    );
  }

  refresh(hostelId: string): Observable<void> {
    this.loadedHostelId = '';
    return this.load(hostelId);
  }

  clear(): void {
    this.contract.set(null);
    this.featuredUntil.set(null);
    this.status.set('idle');
    this.loadedHostelId = '';
  }
}
