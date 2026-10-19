import {
  afterEveryRender,
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  computed,
  inject,
  signal,
} from '@angular/core';
import { toObservable, toSignal } from '@angular/core/rxjs-interop';
import { catchError, map, of, startWith, switchMap } from 'rxjs';
import { format } from 'date-fns';
import { Button, EmptyState, ErrorState, Skeleton } from '@hostelhive/ui';
import { NotificationService } from '@core/notification.service';
import { RefetchDelay } from '@core/refetch-delay';
import { toToastCopy } from '@core/errors/api-error-message';
import { ApiError } from '@hostelhive/data-access';
import { Router } from '@angular/router';
import { StudentApi, UserInvite, isInteractiveType, isReviewRequestType } from '@services';
import { TranslocoPipe } from '@jsverse/transloco';
import { notificationTypeStyle } from '@app/shared/notifications/notification-types';

type TabKey = 'all' | 'pending' | 'accepted' | 'rejected';

interface ListState {
  loading: boolean;
  error: boolean;
  items: UserInvite[];
}

@Component({
  selector: 'hh-notifications-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [Button, EmptyState, ErrorState, Skeleton, TranslocoPipe],
  templateUrl: './notifications.html',
})
export class NotificationsPage {
  private readonly studentApi = inject(StudentApi);
  private readonly notifications = inject(NotificationService);
  private readonly refetchDelay = inject(RefetchDelay);
  private readonly router = inject(Router);
  private readonly el = inject(ElementRef<HTMLElement>);

  private readonly refresh = signal(0);
  private readonly locallyMarkedIds = signal(new Set<string>());
  private observer: IntersectionObserver | null = null;

  constructor() {
    this.observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          const id = (entry.target as HTMLElement).dataset['notificationId'];
          if (!id || this.locallyMarkedIds().has(id)) continue;
          this.locallyMarkedIds.update((s) => new Set([...s, id]));
          this.observer?.unobserve(entry.target);
          this.studentApi.markAsRead(id).subscribe();
        }
      },
      { threshold: 0.5 },
    );

    afterEveryRender(() => this.observeUnreadItems());
    inject(DestroyRef).onDestroy(() => this.observer?.disconnect());
  }

  protected readonly activeTab = signal<TabKey>('all');

  protected readonly tabs: { key: string; label: string }[] = [
    { key: 'all', label: 'All' },
    { key: 'pending', label: 'Pending' },
    { key: 'accepted', label: 'Accepted' },
    { key: 'rejected', label: 'Declined' },
  ];

  private readonly state = toSignal(
    toObservable(this.refresh).pipe(
      switchMap(() =>
        this.studentApi.listInvites().pipe(
          map((r): ListState => ({ loading: false, error: false, items: r.items })),
          startWith<ListState>({ loading: true, error: false, items: [] }),
          catchError(() =>
            of<ListState>({ loading: false, error: true, items: [] }),
          ),
        ),
      ),
    ),
    { initialValue: { loading: true, error: false, items: [] } as ListState },
  );

  protected readonly loading = computed(() => this.state().loading);
  protected readonly error = computed(() => this.state().error);
  protected readonly allItems = computed(() => this.state().items);

  private readonly counts = computed(() => {
    const all = this.allItems();
    return {
      all: all.length,
      pending: all.filter((i) => i.status === 'pending').length,
      accepted: all.filter((i) => i.status === 'accepted').length,
      rejected: all.filter((i) => i.status === 'rejected').length,
    };
  });

  protected readonly items = computed(() => {
    const tab = this.activeTab();
    const all = this.allItems();
    if (tab === 'all') return all;
    return all.filter((i) => i.status === tab);
  });

  protected readonly emptyTitle = computed(() => {
    const tab = this.activeTab();
    return tab === 'all'
      ? 'No notifications yet'
      : `No ${tab} notifications`;
  });

  protected readonly emptyMessage = computed(() => {
    const tab = this.activeTab();
    return tab === 'all'
      ? 'When your hostel sends meal confirmations, rent reminders or receipts, they\'ll appear here.'
      : `You don't have any ${tab} notifications right now.`;
  });

  protected readonly actionLoading = signal<string | null>(null);

  protected setTab(key: string): void {
    this.activeTab.set(key as TabKey);
  }

  protected tabCount(key: string): number {
    const c = this.counts();
    switch (key) {
      case 'all': return c.all;
      case 'pending': return c.pending;
      case 'accepted': return c.accepted;
      case 'rejected': return c.rejected;
      default: return 0;
    }
  }

  protected isInteractive(type: string): boolean {
    return isInteractiveType(type);
  }

  protected isReviewRequest(type: string): boolean {
    return isReviewRequestType(type);
  }

  /** Opens the hostel's page with the review modal, carrying this notification's id
   *  (?review=<id>) so the submitted review posts against the notification. */
  protected goToReview(invite: UserInvite): void {
    if (!invite.associatedId) return;
    void this.router.navigate(['/hostel', invite.associatedId], {
      queryParams: { review: invite.id },
    });
  }

  protected accept(invite: UserInvite): void {
    this.actionLoading.set(invite.id);
    this.studentApi.acceptInvite(invite.id).subscribe({
      next: () => {
        this.actionLoading.set(null);
        this.notifications.show({ kind: 'success', title: 'Invite accepted' });
        this.refetchDelay.track('/api/notifications');
        this.refresh.update((n) => n + 1);
      },
      error: (err: ApiError) => {
        this.actionLoading.set(null);
        const { title, message } = toToastCopy(err);
        this.notifications.show({ kind: 'error', title, message }, 0);
      },
    });
  }

  protected reject(invite: UserInvite): void {
    this.actionLoading.set(invite.id);
    this.studentApi.rejectInvite(invite.id).subscribe({
      next: () => {
        this.actionLoading.set(null);
        this.notifications.show({ kind: 'success', title: 'Invite declined' });
        this.refetchDelay.track('/api/notifications');
        this.refresh.update((n) => n + 1);
      },
      error: (err: ApiError) => {
        this.actionLoading.set(null);
        const { title, message } = toToastCopy(err);
        this.notifications.show({ kind: 'error', title, message }, 0);
      },
    });
  }

  protected retry(): void {
    this.refresh.update((n) => n + 1);
  }

  protected typeIcon(type: string): string {
    return notificationTypeStyle(type).icon;
  }

  protected typeLabelKey(type: string): string | null {
    return notificationTypeStyle(type).labelKey;
  }

  protected typeFallbackLabel(type: string): string {
    return notificationTypeStyle(type).fallbackLabel;
  }

  protected typeBg(type: string): string {
    return notificationTypeStyle(type).bg;
  }

  protected typeTextColor(type: string): string {
    return notificationTypeStyle(type).text;
  }

  protected statusClass(status: string): string {
    switch (status) {
      case 'accepted': return 'bg-emerald-50 text-emerald-700 ring-emerald-200';
      case 'rejected': return 'bg-red-50 text-red-700 ring-red-200';
      default: return 'bg-ink-50 text-ink-700 ring-ink-200';
    }
  }

  protected statusLabel(status: string): string {
    switch (status) {
      case 'accepted': return 'Accepted';
      case 'rejected': return 'Declined';
      default: return status.charAt(0).toUpperCase() + status.slice(1);
    }
  }

  protected formatDateTime(iso: string): string {
    const d = new Date(iso);
    return Number.isNaN(d.getTime())
      ? iso || '—'
      : format(d, 'd MMM yyyy, h:mm a');
  }

  private observeUnreadItems(): void {
    if (!this.observer) return;

    const unreadIds = new Set(
      this.allItems()
        .filter((i) => !i.isRead)
        .map((i) => i.id),
    );

    const els: NodeListOf<HTMLElement> = this.el.nativeElement.querySelectorAll('[data-notification-id]');
    els.forEach((el) => {
      const id = el.dataset['notificationId'];
      if (id && unreadIds.has(id) && !this.locallyMarkedIds().has(id)) {
        this.observer!.observe(el);
      }
    });
  }
}
