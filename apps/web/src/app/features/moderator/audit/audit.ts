import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  signal,
} from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { toObservable, toSignal } from '@angular/core/rxjs-interop';
import { catchError, map, of, startWith, switchMap } from 'rxjs';
import { Button, EmptyState, ErrorState, FilterChips, Skeleton } from '@hostelhive/ui';
import { downloadCsv } from '@util/csv';
import { ModerationApi } from '@services';
import { AuditEntry, AuditGroup, PillTone } from '@hostelhive/data-access';
import { DashboardLayout } from '@layout/dashboard-layout/dashboard-layout';
import { isNetworkError } from '@util/network-error';
import { LocaleLink } from '@core/i18n/locale-link';

interface ViewState {
  loading: boolean;
  error: boolean;
  networkError: boolean;
  data: AuditEntry[] | null;
}

interface DayGroup {
  day: string;
  entries: AuditEntry[];
}

const ICON_TONES: Record<PillTone, string> = {
  ok: 'bg-ok/10 text-ok',
  warn: 'bg-warn/10 text-warn',
  danger: 'bg-danger/10 text-danger',
  neutral: 'bg-tint-sky text-ink-600',
};

@Component({
  selector: 'hh-audit',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [DashboardLayout, RouterLink, LocaleLink, Button, FilterChips, EmptyState, ErrorState, Skeleton],
  templateUrl: './audit.html',
})
export class Audit {
  private readonly api = inject(ModerationApi);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);

  protected readonly skeletons = [1, 2, 3];
  protected readonly filters: { label: string; value: AuditGroup | 'all' }[] = [
    { label: 'All actions', value: 'all' },
    { label: 'Approvals', value: 'approvals' },
    { label: 'Rejections', value: 'rejections' },
    { label: 'Edits', value: 'edits' },
    { label: 'Media', value: 'media' },
  ];

  protected readonly filter = signal<AuditGroup | 'all'>(
    (this.route.snapshot.queryParams['status'] as AuditGroup | 'all') ?? 'all',
  );
  protected setFilter(value: string): void {
    this.filter.set(value as AuditGroup | 'all');
    void this.router.navigate([], {
      queryParams: { status: value === 'all' ? null : value },
      queryParamsHandling: 'merge',
      replaceUrl: true,
    });
  }
  private readonly refresh = signal(0);

  private readonly query = computed(() => {
    this.refresh();
    return this.filter();
  });

  protected readonly state = toSignal(
    toObservable(this.query).pipe(
      switchMap((group) =>
        this.api.audit(group).pipe(
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

  /** Bucket the flat timeline into day sections, preserving order. */
  protected readonly grouped = computed<DayGroup[]>(() => {
    const groups: DayGroup[] = [];
    for (const e of this.state().data ?? []) {
      const last = groups[groups.length - 1];
      if (last && last.day === e.day) last.entries.push(e);
      else groups.push({ day: e.day, entries: [e] });
    }
    return groups;
  });

  protected iconTone(tone: PillTone): string {
    return ICON_TONES[tone];
  }

  protected retry(): void {
    this.refresh.update((n) => n + 1);
  }

  /** CSV export of the loaded audit timeline — client-side download via the shared helper. */
  protected exportCsv(): void {
    const rows = this.state().data ?? [];
    if (!rows.length) return;
    downloadCsv(
      `hostelhive-audit-${this.filter()}`,
      ['Date', 'Time', 'Moderator', 'Action', 'Target', 'Details'],
      rows.map((e) => [
        e.day,
        e.time,
        e.actor,
        e.action,
        e.target,
        `${e.tail} ${e.detail}`.trim(),
      ]),
    );
  }
}
