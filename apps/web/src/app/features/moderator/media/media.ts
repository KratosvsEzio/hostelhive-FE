import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
  inject,
  signal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { forkJoin } from 'rxjs';
import { ActivatedRoute, Router } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { format, parseISO } from 'date-fns';
import { Button, EmptyState, ErrorState, FilterChipOption, FilterChips, Skeleton } from '@hostelhive/ui';
import { DashboardLayout } from '@layout/dashboard-layout/dashboard-layout';
import { ModerationApi } from '@services';
import { AttachmentStatusOption, ModeratorAttachment } from '@hostelhive/data-access';
import { TranslocoPipe } from '@jsverse/transloco';

type LoadStatus = 'loading' | 'ready' | 'loading-more' | 'error';
type ApproveModalItem = { attachment: ModeratorAttachment; status: 'pending' | 'success' | 'error' };
type RejectProgressItem = { attachment: ModeratorAttachment; status: 'pending' | 'success' | 'error' };

@Component({
  selector: 'hh-media',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [DashboardLayout, Button, EmptyState, ErrorState, FilterChips, Skeleton, FormsModule, TranslocoPipe],
  templateUrl: './media.html',
})
export class Media {
  private readonly api = inject(ModerationApi);
  private readonly destroyRef = inject(DestroyRef);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);

  protected readonly skeletons = [1, 2, 3, 4];

  // ── loading state ─────────────────────────────────────────────────────────────
  protected readonly loadStatus = signal<LoadStatus>('loading');
  protected readonly loadMoreError = signal(false);

  // ── data ─────────────────────────────────────────────────────────────────────
  private readonly _allItems = signal<ModeratorAttachment[]>([]);
  private readonly _nextPage = signal<number | null>(null);
  /** How deep the moderator has paged, so a refresh can put back what they had. */
  private readonly loadedPages = signal(1);
  /** A refresh in flight. Never shown — it exists so refreshes cannot stack. */
  private readonly refreshing = signal(false);
  protected readonly totalCount = signal(0);
  protected readonly hasMore = computed(() => this._nextPage() !== null);
  protected readonly possibleStatuses = signal<AttachmentStatusOption[]>([]);
  protected readonly activeStatus = signal(
    this.route.snapshot.queryParams['status'] ?? '',
  );
  protected readonly statusTabs = computed<FilterChipOption[]>(() => [
    { label: 'All', value: '' },
    ...this.possibleStatuses().map((s) => ({ label: s.name, value: s.slug })),
  ]);

  // ── decision tracking ─────────────────────────────────────────────────────────
  private readonly decisions = signal<Record<string, 'approved' | 'rejected'>>({});
  protected readonly approving = signal<Set<string>>(new Set());
  protected readonly approveErrors = signal<Set<string>>(new Set());
  protected readonly selectedIds = signal<Set<string>>(new Set());
  protected readonly imgErrors = signal<Set<string>>(new Set());
  protected readonly previewAttachment = signal<ModeratorAttachment | null>(null);

  // ── rejection modal ───────────────────────────────────────────────────────────
  /** Attachments queued to be rejected — single item or all pending (bulk). */
  protected readonly rejectQueue = signal<ModeratorAttachment[]>([]);
  protected readonly rejectNote = signal('');
  protected readonly rejectApiError = signal(false);
  protected readonly rejectModalOpen = computed(() => this.rejectQueue().length > 0);

  // ── rejection progress modal ──────────────────────────────────────────────────
  protected readonly rejectProgressQueue = signal<RejectProgressItem[]>([]);
  protected readonly rejectProgressOpen = computed(() => this.rejectProgressQueue().length > 0);
  protected readonly rejectProgressProgress = computed(() => {
    const q = this.rejectProgressQueue();
    const done = q.filter(i => i.status !== 'pending').length;
    const success = q.filter(i => i.status === 'success').length;
    const errors = q.filter(i => i.status === 'error').length;
    return { total: q.length, done, success, errors, allDone: done === q.length };
  });

  // ── approval modal ────────────────────────────────────────────────────────────
  protected readonly approveModalQueue = signal<ApproveModalItem[]>([]);
  protected readonly approveModalOpen = computed(() => this.approveModalQueue().length > 0);
  protected readonly approveModalProgress = computed(() => {
    const q = this.approveModalQueue();
    const done = q.filter(i => i.status !== 'pending').length;
    const success = q.filter(i => i.status === 'success').length;
    const errors = q.filter(i => i.status === 'error').length;
    return { total: q.length, done, success, errors, allDone: done === q.length };
  });

  // ── derived ───────────────────────────────────────────────────────────────────
  protected readonly items = computed(() => this._allItems());

  protected readonly pending = computed(() => {
    const done = this.decisions();
    return this.items().filter((a) => !done[String(a.id)]);
  });

  protected readonly allCleared = computed(() => {
    if (this.loadStatus() === 'loading') return false;
    if (this.hasMore()) return false;
    return this.pending().length === 0;
  });

  protected readonly selected = computed(() => {
    const sel = this.selectedIds();
    return this.pending().filter((a) => sel.has(String(a.id)));
  });

  // ── lifecycle ─────────────────────────────────────────────────────────────────
  constructor() {
    this.fetchPage(1, false);
  }

  // ── pagination ────────────────────────────────────────────────────────────────
  private fetchPage(page: number, append: boolean): void {
    this.loadMoreError.set(false);
    this.loadStatus.set(append ? 'loading-more' : 'loading');

    this.api
      .attachments(page, this.activeStatus() || undefined)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (data) => {
          if (append) {
            this._allItems.update((prev) => [...prev, ...data.items]);
          } else {
            this._allItems.set(data.items);
          }
          this._nextPage.set(data.nextPage);
          this.loadedPages.set(page);
          this.totalCount.set(data.totalCount);
          if (data.possibleStatuses.length) this.possibleStatuses.set(data.possibleStatuses);
          this.loadStatus.set('ready');
        },
        error: () => {
          if (append) {
            this.loadMoreError.set(true);
            this.loadStatus.set('ready');
          } else {
            this.loadStatus.set('error');
          }
        },
      });
  }

  protected loadMore(): void {
    const next = this._nextPage();
    if (next === null || this.loadStatus() === 'loading-more') return;
    this.fetchPage(next, true);
  }

  /**
   * Re-reads the queue after a decision, without the page going blank.
   *
   * A decision changes the list underneath the moderator — an approved photo leaves the
   * pending set and everything behind it moves up — so what is on screen stops matching the
   * server the moment they act. Going through {@link fetchPage} would say so by flipping to
   * skeletons, which is a flash for a wait nobody asked for; this leaves the loading state
   * alone and swaps the data in when it arrives.
   *
   * Every page already loaded is re-read, not just the first: snapping the queue back to page
   * one on each approval would make it impossible to work past the first screenful.
   *
   * `decisions` is deliberately left alone. The grid has no notion of an approved card — it
   * renders what is undecided — so forgetting a decision would put a photo the moderator has
   * already approved back in front of them with its buttons live.
   */
  private refreshQuietly(): void {
    // Nothing to refresh into: the first load or a retry owns the list, and a load-more is
    // already on its way with a page this would drop.
    if (this.refreshing() || this.loadStatus() !== 'ready') return;

    const status = this.activeStatus() || undefined;
    const pages = Array.from({ length: this.loadedPages() }, (_, i) => i + 1);
    this.refreshing.set(true);
    forkJoin(pages.map((p) => this.api.attachments(p, status)))
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (loaded) => {
          const last = loaded[loaded.length - 1];
          // Deduplicated because the pages are read together but the server paginates a list
          // that just got shorter: an item on page 2 a moment ago can come back on page 1 as
          // well, and two cards with one id is a duplicate-key error in the grid.
          const seen = new Set<string>();
          this._allItems.set(
            loaded
              .flatMap((d) => d.items)
              .filter((a) => {
                const id = String(a.id);
                if (seen.has(id)) return false;
                seen.add(id);
                return true;
              }),
          );
          this._nextPage.set(last.nextPage);
          this.totalCount.set(last.totalCount);
          if (last.possibleStatuses.length) this.possibleStatuses.set(last.possibleStatuses);
          this.refreshing.set(false);
        },
        // A refresh that fails is not the moderator's problem to solve: what is on screen
        // still reflects every decision they made, so the quiet thing to do is stay quiet.
        error: () => this.refreshing.set(false),
      });
  }

  protected setStatus(slug: string): void {
    if (this.activeStatus() === slug) return;
    this.activeStatus.set(slug);
    this._allItems.set([]);
    this._nextPage.set(null);
    this.loadedPages.set(1);
    this.decisions.set({});
    this.approving.set(new Set());
    this.approveErrors.set(new Set());
    this.approveModalQueue.set([]);
    this.rejectProgressQueue.set([]);
    this.selectedIds.set(new Set());
    this.imgErrors.set(new Set());
    void this.router.navigate([], {
      queryParams: { status: slug || null },
      queryParamsHandling: 'merge',
      replaceUrl: true,
    });
    this.fetchPage(1, false);
  }

  // ── actions ───────────────────────────────────────────────────────────────────
  protected toggleSelect(id: string): void {
    this.selectedIds.update((s) => {
      const n = new Set(s);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });
  }

  protected onImgError(id: string): void {
    this.imgErrors.update((s) => new Set(s).add(id));
  }

  protected approveSelected(): void {
    const items = this.selected();
    if (!items.length) return;

    this.approveModalQueue.set(items.map(a => ({ attachment: a, status: 'pending' as const })));
    this.selectedIds.set(new Set());

    items.forEach((a, i) => {
      this.api
        .markAttachmentAsActive(String(a.id))
        .pipe(takeUntilDestroyed(this.destroyRef))
        .subscribe({
          next: () => {
            this.approveModalQueue.update(q => {
              const next = [...q];
              next[i] = { ...next[i], status: 'success' };
              return next;
            });
            this.decisions.update(m => ({ ...m, [String(a.id)]: 'approved' }));
            this.refreshWhenSettled(this.approveModalProgress());
          },
          error: () => {
            this.approveModalQueue.update(q => {
              const next = [...q];
              next[i] = { ...next[i], status: 'error' };
              return next;
            });
            this.refreshWhenSettled(this.approveModalProgress());
          },
        });
    });
  }

  /** Once the batch stops moving — deciding ten photos is one list to re-read, not ten. */
  private refreshWhenSettled(progress: { allDone: boolean }): void {
    if (progress.allDone) this.refreshQuietly();
  }

  protected closeApproveModal(): void {
    this.approveModalQueue.set([]);
  }

  /** Opens the rejection modal — for selected items if any, otherwise all pending. */
  protected rejectAll(): void {
    const items = this.selected().length > 0 ? this.selected() : this.pending();
    if (!items.length) return;
    this.openRejectModal(items);
    this.selectedIds.set(new Set());
  }

  protected setOne(a: ModeratorAttachment, decision: 'approved' | 'rejected'): void {
    if (decision === 'approved') {
      this.approveOne(a);
    } else {
      this.openRejectModal([a]);
    }
  }

  private openRejectModal(items: ModeratorAttachment[]): void {
    this.rejectQueue.set(items);
    this.rejectNote.set('');
    this.rejectApiError.set(false);
  }

  protected cancelReject(): void {
    this.rejectQueue.set([]);
    this.rejectNote.set('');
    this.rejectApiError.set(false);
  }

  protected confirmReject(): void {
    const queue = this.rejectQueue();
    const notes = this.rejectNote().trim();
    if (!queue.length || !notes) return;

    this.rejectProgressQueue.set(queue.map(a => ({ attachment: a, status: 'pending' as const })));
    this.rejectQueue.set([]);
    this.rejectNote.set('');
    this.rejectApiError.set(false);

    queue.forEach((a, i) => {
      this.api
        .markAttachmentAsRejected(String(a.id), notes)
        .pipe(takeUntilDestroyed(this.destroyRef))
        .subscribe({
          next: () => {
            this.rejectProgressQueue.update(q => {
              const next = [...q];
              next[i] = { ...next[i], status: 'success' };
              return next;
            });
            this.decisions.update(m => ({ ...m, [String(a.id)]: 'rejected' }));
            this.refreshWhenSettled(this.rejectProgressProgress());
          },
          error: () => {
            this.rejectProgressQueue.update(q => {
              const next = [...q];
              next[i] = { ...next[i], status: 'error' };
              return next;
            });
            this.refreshWhenSettled(this.rejectProgressProgress());
          },
        });
    });
  }

  protected closeRejectProgressModal(): void {
    this.rejectProgressQueue.set([]);
  }

  private approveOne(a: ModeratorAttachment): void {
    const id = String(a.id);
    if (this.approving().has(id)) return;
    this.approving.update((s) => new Set(s).add(id));
    this.approveErrors.update((s) => { const n = new Set(s); n.delete(id); return n; });
    this.api
      .markAttachmentAsActive(id)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.approving.update((s) => { const n = new Set(s); n.delete(id); return n; });
          this.decisions.update((m) => ({ ...m, [id]: 'approved' }));
          this.refreshQuietly();
        },
        error: () => {
          this.approving.update((s) => { const n = new Set(s); n.delete(id); return n; });
          this.approveErrors.update((s) => new Set(s).add(id));
        },
      });
  }

  protected openPreview(a: ModeratorAttachment): void { this.previewAttachment.set(a); }
  protected closePreview(): void { this.previewAttachment.set(null); }

  protected retry(): void {
    this._allItems.set([]);
    this._nextPage.set(null);
    this.loadedPages.set(1);
    this.decisions.set({});
    this.approving.set(new Set());
    this.approveErrors.set(new Set());
    this.approveModalQueue.set([]);
    this.rejectProgressQueue.set([]);
    this.selectedIds.set(new Set());
    this.imgErrors.set(new Set());
    this.fetchPage(1, false);
  }

  // ── display helpers ───────────────────────────────────────────────────────────
  protected kindBadge(a: ModeratorAttachment): { label: string; cls: string } | null {
    switch (a.key) {
      case 'attachments': return { label: 'Photo',      cls: 'bg-gray-500/90 text-white' };
      case 'banner':      return { label: 'Banner',     cls: 'bg-purple-500/90 text-white' };
      case 'logo':        return { label: 'Logo',       cls: 'bg-amber-500/90 text-white' };
      case 'avatar':      return { label: 'Avatar',     cls: 'bg-sky-500/90 text-white' };
      case 'cnic_front':  return { label: 'CNIC Front', cls: 'bg-emerald-600/90 text-white' };
      case 'cnic_back':   return { label: 'CNIC Back',  cls: 'bg-teal-600/90 text-white' };
      default:            return a.key
        ? { label: a.key.replace(/_/g, ' '), cls: 'bg-ink-600/80 text-white' }
        : null;
    }
  }

  protected entityName(a: ModeratorAttachment): string {
    return a.hostel?.name ?? a.user?.name ?? this.keyLabel(a.key);
  }

  protected keyLabel(key?: string | null): string {
    switch (key) {
      case 'cnic_front':  return 'CNIC — Front side';
      case 'cnic_back':   return 'CNIC — Back side';
      case 'avatar':      return 'Profile photo';
      case 'banner':      return 'Banner image';
      case 'logo':        return 'Logo';
      case 'attachments': return 'Room photo';
      default:            return key ? key.replace(/_/g, ' ') : '—';
    }
  }

  protected hostLine(a: ModeratorAttachment): string {
    if (a.hostel?.host?.name) return a.hostel.host.name;
    if (a.attached_type) return `Uploaded by ${a.attached_type}`;
    return '';
  }

  protected dateLabel(iso?: string | null): string {
    if (!iso) return '';
    try { return format(parseISO(iso), 'd MMM yyyy'); } catch { return ''; }
  }
}
