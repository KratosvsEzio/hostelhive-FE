import {
  ChangeDetectionStrategy,
  Component,
  PLATFORM_ID,
  computed,
  inject,
  signal,
} from '@angular/core';
import { DatePipe, DecimalPipe, isPlatformBrowser } from '@angular/common';
import { RouterLink } from '@angular/router';
import { Button, EmptyState, ErrorState, Skeleton, StatusPill } from '@hostelhive/ui';
import { LocaleLink } from '@core/i18n/locale-link';
import { TranslocoPipe } from '@jsverse/transloco';
import { PageInfo } from '@util/pagination';
import { BookingTiming, GuestBooking, MyBookingsApi, timingOf } from './my-bookings-api';
import { asDay, statusOf } from './booking-status';

interface Section {
  key: BookingTiming;
  titleKey: string;
  bookings: GuestBooking[];
}

/**
 * The guest's own bookings, one row each. A row opens the booking's own page.
 *
 * Grouped by *when*, not by status: somebody opens this page to find the stay they are about
 * to leave for, so what is happening now comes first, then what is coming, then the past,
 * which stays listed because the booking is the receipt.
 *
 * Each row hands its booking to the detail page in the navigation state, so the page draws
 * at once instead of fetching what this one already has.
 */
@Component({
  selector: 'app-account-bookings',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    DatePipe,
    DecimalPipe,
    RouterLink,
    LocaleLink,
    Button,
    EmptyState,
    ErrorState,
    Skeleton,
    StatusPill,
    TranslocoPipe,
  ],
  templateUrl: './bookings.html',
})
export class AccountBookings {
  private readonly api = inject(MyBookingsApi);

  protected readonly loading = signal(true);
  protected readonly error = signal(false);
  protected readonly loadingMore = signal(false);
  protected readonly moreError = signal(false);
  private readonly rows = signal<GuestBooking[]>([]);
  private readonly pageInfo = signal<PageInfo | null>(null);

  protected readonly hasMore = computed(() => this.pageInfo()?.hasNextPage ?? false);
  protected readonly isEmpty = computed(() => !this.rows().length);

  protected readonly status = statusOf;
  protected readonly day = asDay;

  /** Read once per load: a page left open does not need to re-sort itself at midnight. */
  private now = Date.now();

  protected readonly sections = computed<Section[]>(() => {
    const now = this.now;
    const by = { current: [], upcoming: [], past: [] } as Record<BookingTiming, GuestBooking[]>;
    for (const b of this.rows()) by[timingOf(b, now)].push(b);
    by.current.sort((a, b) => a.checkOutAt - b.checkOutAt);
    by.upcoming.sort((a, b) => a.checkInAt - b.checkInAt);
    by.past.sort((a, b) => b.checkInAt - a.checkInAt);
    const all: Section[] = [
      { key: 'current', titleKey: 'userBookings.happeningNow', bookings: by.current },
      { key: 'upcoming', titleKey: 'userBookings.upcoming', bookings: by.upcoming },
      { key: 'past', titleKey: 'userBookings.past', bookings: by.past },
    ];
    return all.filter((s) => s.bookings.length);
  });

  constructor() {
    // The server render has no token, so the request would 401 and paint the error state
    // until the browser took over. It stays on the skeleton instead.
    if (isPlatformBrowser(inject(PLATFORM_ID))) this.load();
  }

  protected load(): void {
    this.loading.set(true);
    this.error.set(false);
    this.now = Date.now();
    this.api.list(1).subscribe({
      next: (res) => {
        this.rows.set(res.bookings);
        this.pageInfo.set(res.page);
        this.loading.set(false);
      },
      error: () => {
        this.error.set(true);
        this.loading.set(false);
      },
    });
  }

  protected loadMore(): void {
    const info = this.pageInfo();
    if (!info?.hasNextPage || this.loadingMore()) return;
    this.loadingMore.set(true);
    this.moreError.set(false);
    this.api.list(info.page + 1).subscribe({
      next: (res) => {
        const seen = new Set(this.rows().map((b) => b.id));
        this.rows.update((rows) => [...rows, ...res.bookings.filter((b) => !seen.has(b.id))]);
        this.pageInfo.set(res.page);
        this.loadingMore.set(false);
      },
      error: () => {
        this.moreError.set(true);
        this.loadingMore.set(false);
      },
    });
  }
}
