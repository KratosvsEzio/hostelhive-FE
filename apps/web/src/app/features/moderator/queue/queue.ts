import {
  ChangeDetectionStrategy,
  Component,
  PLATFORM_ID,
  computed,
  effect,
  inject,
  signal,
} from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { RouterLink } from '@angular/router';
import { toObservable, toSignal } from '@angular/core/rxjs-interop';
import { catchError, filter, map, of, startWith, switchMap } from 'rxjs';
import {
  Button,
  DropdownOption,
  EmptyState,
  ErrorState,
  Search,
  Skeleton,
  StatusPill,
} from '@hostelhive/ui';
import { ModerationApi } from '@services';
import { QueueItem } from '@hostelhive/data-access';
import { DashboardLayout } from '@layout/dashboard-layout/dashboard-layout';
import { isNetworkError } from '@util/network-error';

interface ViewState {
  loading: boolean;
  error: boolean;
  networkError: boolean;
  data: QueueItem[] | null;
}

const PAGE_SIZE = 5;

@Component({
  selector: 'hh-queue',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [DashboardLayout, RouterLink, Button, EmptyState, ErrorState, Search, Skeleton, StatusPill],
  templateUrl: './queue.html',
})
export class Queue {
  private readonly api = inject(ModerationApi);

  protected readonly skeletons = [1, 2, 3, 4];

  protected readonly searchField = signal<'name' | 'host' | 'city'>('name');
  protected readonly searchFieldOptions: DropdownOption[] = [
    { value: 'name', label: 'Hostel name' },
    { value: 'host', label: 'Host' },
    { value: 'city', label: 'City' },
  ];
  protected readonly searchTerm = signal('');

  protected readonly page = signal(1);
  private readonly refresh = signal(0);
  protected readonly sortDir = signal<'asc' | 'desc' | null>(null);

  private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));
  private readonly query = computed(() => ({ r: this.refresh(), sort: this.sortDir() }));

  // Re-fetch whenever refresh counter or sort direction changes.
  // Skip entirely during SSR — no auth token is available server-side, so the
  // request would fail and bake an error state into the SSR HTML.
  protected readonly state = toSignal(
    toObservable(this.query).pipe(
      filter(() => this.isBrowser),
      switchMap((q) =>
        this.api.queue(q.sort).pipe(
          map((data): ViewState => ({ loading: false, error: false, networkError: false, data })),
          startWith<ViewState>({ loading: true, error: false, networkError: false, data: null }),
          catchError((err) =>
            of<ViewState>({ loading: false, error: true, networkError: isNetworkError(err), data: null }),
          ),
        ),
      ),
    ),
    { initialValue: { loading: true, error: false, networkError: false, data: null } as ViewState },
  );

  protected readonly visible = computed(() => {
    const items = this.state().data ?? [];
    const term = this.searchTerm().trim().toLowerCase();
    if (!term) return items;
    const field = this.searchField();
    return items.filter((q) => {
      const val = field === 'host' ? q.host : field === 'city' ? q.city : q.name;
      return val.toLowerCase().includes(term);
    });
  });

  protected readonly pageCount = computed(() =>
    Math.max(1, Math.ceil(this.visible().length / PAGE_SIZE)),
  );

  protected readonly paged = computed(() => {
    const start = (this.page() - 1) * PAGE_SIZE;
    return this.visible().slice(start, start + PAGE_SIZE);
  });

  constructor() {
    // Reset to page 1 whenever the search changes.
    effect(() => {
      this.searchTerm();
      this.searchField();
      this.page.set(1);
    });
  }

  protected onSearchTerm(term: string): void {
    this.searchTerm.set(term);
  }

  protected onSearchField(field: string | string[] | null): void {
    this.searchField.set((field as 'name' | 'host' | 'city') ?? 'name');
  }

  protected queueTone(hours: number): 'ok' | 'warn' | 'danger' {
    if (hours >= 48) return 'danger';
    if (hours >= 24) return 'warn';
    return 'ok';
  }

  protected queueLabel(hours: number): string {
    if (hours >= 24) {
      const days = Math.round(hours / 24);
      return `${days} day${days === 1 ? '' : 's'}`;
    }
    return `${hours} hr${hours === 1 ? '' : 's'}`;
  }

  protected toggleSort(): void {
    const next =
      this.sortDir() === null ? 'asc' : this.sortDir() === 'asc' ? 'desc' : null;
    this.sortDir.set(next);
    this.page.set(1);
  }

  protected sortIcon(): string {
    const d = this.sortDir();
    if (d === 'asc') return 'ti-arrow-up';
    if (d === 'desc') return 'ti-arrow-down';
    return 'ti-arrows-sort';
  }

  protected retry(): void {
    this.refresh.update((n) => n + 1);
  }
}
