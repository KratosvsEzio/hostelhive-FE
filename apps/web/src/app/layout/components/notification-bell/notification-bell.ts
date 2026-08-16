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
import { takeUntilDestroyed, toObservable, toSignal } from '@angular/core/rxjs-interop';
import { NavigationStart, Router, RouterLink } from '@angular/router';
import { catchError, filter, map, of, startWith, switchMap, tap } from 'rxjs';
import { formatDistanceToNow } from 'date-fns';
import { Button, Skeleton } from '@hostelhive/ui';
import { SessionStore } from '@core/auth';
import { NotificationService } from '@core/notification.service';
import { PushNotificationsService } from '@core/push-notifications';
import { RefetchDelay } from '@core/refetch-delay';
import { toToastCopy } from '@core/errors/api-error-message';
import { ApiError } from '@hostelhive/data-access';
import { StudentApi, UserInvite, isInteractiveType, isReviewRequestType } from '@services';

interface ListState {
  loading: boolean;
  items: UserInvite[];
  unread: number;
}

@Component({
  selector: 'app-notification-bell',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, Button, Skeleton],
  host: {
    '(document:click)': 'onDocumentClick($event)',
    '(document:keydown.escape)': 'onEscape()',
  },
  templateUrl: './notification-bell.html',
})
export class NotificationBell {
  private readonly studentApi = inject(StudentApi);
  private readonly session = inject(SessionStore);
  private readonly toasts = inject(NotificationService);
  private readonly router = inject(Router);
  private readonly el = inject(ElementRef<HTMLElement>);
  private readonly refetchDelay = inject(RefetchDelay);
  private readonly push = inject(PushNotificationsService);

  protected readonly open = signal(false);
  protected readonly actionLoading = signal<string | null>(null);
  private readonly dismissing = signal(false);

  private readonly refresh = signal(0);
  private readonly locallyMarkedIds = signal(new Set<string>());
  private observer: IntersectionObserver | null = null;

  constructor() {
    this.router.events
      .pipe(
        filter((e) => e instanceof NavigationStart),
        takeUntilDestroyed(),
      )
      .subscribe(() => this.close());

    afterEveryRender(() => {
      if (!this.open()) {
        this.observer?.disconnect();
        this.observer = null;
        return;
      }
      this.observeUnreadItems();
    });

    inject(DestroyRef).onDestroy(() => this.observer?.disconnect());
  }

  private readonly fetchKey = computed(() => ({
    auth: this.session.isAuthenticated(),
    r: this.refresh(),
    // A push landing while the app is open raises no tray notification on Android, so
    // the bell is the only cue the user gets — refetch so the badge reflects it.
    push: this.push.received(),
  }));

  private readonly state = toSignal(
    toObservable(this.fetchKey).pipe(
      switchMap(({ auth }) => {
        if (!auth) return of<ListState>({ loading: false, items: [], unread: 0 });
        return this.studentApi.listInvites().pipe(
          map((r): ListState => ({ loading: false, items: r.items, unread: r.unread })),
          startWith<ListState>({ loading: true, items: [], unread: 0 }),
          catchError(() => of<ListState>({ loading: false, items: [], unread: 0 })),
        );
      }),
      tap((s) => { if (!s.loading) this.dismissing.set(false); }),
    ),
    { initialValue: { loading: false, items: [], unread: 0 } as ListState },
  );

  protected readonly loading = computed(() => this.state().loading || this.dismissing());
  protected readonly allItems = computed(() => this.state().items);
  protected readonly unreadCount = computed(() => this.state().unread);
  protected readonly recentItems = computed(() => this.allItems().slice(0, 5));

  protected toggle(): void {
    this.open.update((o) => !o);
  }

  protected close(): void {
    this.open.set(false);
  }

  protected onDocumentClick(event: MouseEvent): void {
    if (!this.open()) return;
    if (this.el.nativeElement.contains(event.target as Node)) return;
    this.close();
  }

  protected onEscape(): void {
    if (!this.open()) return;
    this.close();
  }

  protected isInteractive(type: string): boolean {
    return isInteractiveType(type);
  }

  protected isReviewRequest(type: string): boolean {
    return isReviewRequestType(type);
  }

  /** Closes the dropdown and opens the hostel's page with the review modal, carrying this
   *  notification's id (?review=<id>) so the submitted review posts against the notification. */
  protected goToReview(invite: UserInvite, event: Event): void {
    event.stopPropagation();
    if (!invite.associatedId) return;
    this.close();
    void this.router.navigate(['/hostel', invite.associatedId], {
      queryParams: { review: invite.id },
    });
  }

  protected dismiss(invite: UserInvite, event: Event): void {
    event.stopPropagation();
    this.dismissing.set(true);
    this.studentApi.deleteNotification(invite.id).subscribe({
      next: () => {
        this.refetchDelay.track('/api/notifications');
        this.refresh.update((n) => n + 1);
      },
      error: (err: ApiError) => {
        this.dismissing.set(false);
        const { title, message } = toToastCopy(err);
        this.toasts.show({ kind: 'error', title, message }, 0);
      },
    });
  }

  protected accept(invite: UserInvite, event: Event): void {
    event.stopPropagation();
    this.actionLoading.set(invite.id);
    this.studentApi.acceptInvite(invite.id).subscribe({
      next: () => {
        this.actionLoading.set(null);
        this.toasts.show({ kind: 'success', title: 'Invite accepted' });
        this.refetchDelay.track('/api/notifications');
        this.refresh.update((n) => n + 1);
      },
      error: (err: ApiError) => {
        this.actionLoading.set(null);
        const { title, message } = toToastCopy(err);
        this.toasts.show({ kind: 'error', title, message }, 0);
      },
    });
  }

  protected reject(invite: UserInvite, event: Event): void {
    event.stopPropagation();
    this.actionLoading.set(invite.id);
    this.studentApi.rejectInvite(invite.id).subscribe({
      next: () => {
        this.actionLoading.set(null);
        this.toasts.show({ kind: 'success', title: 'Invite declined' });
        this.refetchDelay.track('/api/notifications');
        this.refresh.update((n) => n + 1);
      },
      error: (err: ApiError) => {
        this.actionLoading.set(null);
        const { title, message } = toToastCopy(err);
        this.toasts.show({ kind: 'error', title, message }, 0);
      },
    });
  }

  protected typeIcon(type: string): string {
    switch (type) {
      case 'meal_confirmation': return 'ti-tools-kitchen-2';
      case 'rent': return 'ti-cash';
      case 'receipt': return 'ti-receipt';
      default: return 'ti-bell';
    }
  }

  protected typeLabel(type: string): string {
    switch (type) {
      case 'meal_confirmation': return 'Meal Confirmation';
      case 'rent': return 'Rent';
      case 'receipt': return 'Receipt';
      default:
        return type
          .replace(/_/g, ' ')
          .replace(/\b\w/g, (c) => c.toUpperCase());
    }
  }

  protected typeBg(type: string): string {
    switch (type) {
      case 'meal_confirmation': return 'bg-emerald-50 text-emerald-600';
      case 'rent': return 'bg-amber-50 text-amber-600';
      case 'receipt': return 'bg-blue-50 text-blue-600';
      default: return 'bg-ink-50 text-ink-600';
    }
  }

  protected typeTextColor(type: string): string {
    switch (type) {
      case 'meal_confirmation': return 'text-emerald-600';
      case 'rent': return 'text-amber-600';
      case 'receipt': return 'text-blue-600';
      default: return 'text-ink-500';
    }
  }

  protected timeAgo(iso: string): string {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '';
    return formatDistanceToNow(d, { addSuffix: true });
  }

  private observeUnreadItems(): void {
    if (!this.observer) {
      const root = this.el.nativeElement.querySelector('.overflow-y-auto');
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
        { root, threshold: 0.5 },
      );
    }

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
