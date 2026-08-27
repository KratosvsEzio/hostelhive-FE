import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  computed,
  effect,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import {
  takeUntilDestroyed,
  toObservable,
  toSignal,
} from '@angular/core/rxjs-interop';
import { catchError, map, of, startWith, switchMap } from 'rxjs';
import { HostelsApi, ModerationApi } from '@services';
import {
  Button,
  ConfirmModal,
  ErrorState,
  Skeleton,
  StatusPill,
} from '@hostelhive/ui';
import { DashboardLayout } from '@layout/dashboard-layout/dashboard-layout';
import { HostelForm } from '@features/host/hostel-form/hostel-form';
import {
  EMPTY_HOSTEL_FORM_OPTIONS,
  ReviewDetail,
  ReviewPhoto,
} from '@hostelhive/data-access';
import { isNetworkError } from '@util/network-error';
import { LocaleLink } from '@core/i18n/locale-link';
import { LocaleStore } from '@core/i18n/locale-store';
import { localiseCommands } from '@core/i18n/locale-commands';
import { TranslocoPipe } from '@jsverse/transloco';


interface ViewState {
  loading: boolean;
  error: boolean;
  networkError: boolean;
  data: ReviewDetail | null;
}

@Component({
  selector: 'hh-review',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    DashboardLayout,
    HostelForm,
    RouterLink, LocaleLink,
    Button,
    ConfirmModal,
    ErrorState,
    Skeleton,
    StatusPill,
    TranslocoPipe,
  ],
  templateUrl: './review.html',
})
export class Review {
  private readonly api = inject(ModerationApi);
  private readonly hostels = inject(HostelsApi);
  private readonly destroyRef = inject(DestroyRef);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly locale = inject(LocaleStore);

  /** Route param — `review/:id`. Read from ActivatedRoute (apps don't enable component input binding). */
  protected readonly id = toSignal(
    this.route.paramMap.pipe(map((p) => p.get('id') ?? '')),
    {
      initialValue: '',
    },
  );

  private readonly refresh = signal(0);

  protected readonly state = toSignal(
    toObservable(computed(() => ({ id: this.id(), r: this.refresh() }))).pipe(
      switchMap(({ id }) =>
        this.api.getById(id).pipe(
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

  // Local editable copy — seeded from the loaded detail.
  protected readonly name = signal('');
  protected readonly description = signal('');
  protected readonly landmarks = signal('');
  protected readonly propertyType = signal('');
  protected readonly genderType = signal('');

  // Editable location — seeded from loaded detail, updated when user moves the map pin or picks a place.
  protected readonly locLat = signal<number | null>(null);
  protected readonly locLng = signal<number | null>(null);
  protected readonly locCountry = signal('');
  protected readonly locCity = signal('');
  protected readonly locState = signal('');
  protected readonly locArea = signal('');
  protected readonly locAddress1 = signal('');

  protected readonly formOptions = toSignal(
    this.api.formOptions().pipe(catchError(() => of(EMPTY_HOSTEL_FORM_OPTIONS))),
    { initialValue: EMPTY_HOSTEL_FORM_OPTIONS },
  );

  /** Per-photo label selection: photoId → label id as string (for dropdown binding), or null. */
  protected readonly photoLabelMap = signal<Map<string, string | null>>(
    new Map(),
  );
  protected readonly photos = signal<ReviewPhoto[]>([]);

  /** Hidden <input type=file> in the template; opened to pick a device image. */
  private readonly fileInput =
    viewChild.required<ElementRef<HTMLInputElement>>('fileInput');
  /** The photo to overwrite when the picker returns; null = append a new photo. */
  private readonly replaceTarget = signal<ReviewPhoto | null>(null);
  /** True when at least one photo upload is in progress. */
  /** The form owns the uploads; this screen only needs to know not to save mid-flight. */
  protected readonly uploading = computed(() => this.hostelForm()?.uploading() ?? false);
  /** True when the user tries to add photos beyond the 10-image limit. */
  protected readonly photoLimitOpen = signal(false);
  /** Photo pending removal confirmation — non-null while the confirm modal is open. */
  /** The shared hostel form. Everything editable about the listing lives in there. */
  private readonly hostelForm = viewChild(HostelForm);

  /**
   * Photos this moderator has rejected, and why — id → reason shown to the host.
   *
   * The only piece of listing state this screen still owns. A rejection is not an edit to the
   * hostel: it is a message to its host, it survives until the review is submitted, and it is
   * undoable, none of which the form has any business knowing about.
   */
  protected readonly rejectedPhotos = signal<ReadonlyMap<string, string>>(new Map());

  /** The photo awaiting a confirm, by id. Only ever a host's photo — see `moderating`. */
  protected readonly removeConfirmPhotoId = signal<string | null>(null);
  /** Attachment IDs from completed S3 uploads, flushed to the hostel on the next save. */
  private readonly pendingAttachmentIds = signal<string[]>([]);
  /** Maps temp photo card ID → S3 attachment UUID for photos added this session.
   *  Used to distinguish new uploads (remove entirely) from existing photos (mark rejected). */
  protected readonly newPhotoMap = signal<Map<string, string>>(new Map());
  protected readonly audit = signal<ReviewDetail['audit']>([]);
  protected readonly flagged = signal(false);
  protected readonly decision = signal<'approve' | null>(null);
  protected readonly approving = signal(false);
  protected readonly approveError = signal(false);
  protected readonly validationModalOpen = signal(false);

  // ── editable amenities (selectable offers → saved as part of the page-level Update) ──
  /** Selected catalogue offer ids — saved as `offer_ids`. */
  protected readonly selectedOfferIds = signal<Set<string>>(new Set());
  /** Whether the full catalogue is shown (else just the first category). */
  protected readonly showAll = signal(false);

  // ── room types ──

  // ── page-level save (core fields + amenities → PUT /api/hostels/:id) ──
  /** Last in-session save — overlays the loaded baseline so the dirty check + Update button reset after saving. */
  protected readonly saving = signal(false);
  protected readonly saved = signal(false);
  protected readonly saveError = signal(false);
  /**
   * Whether there is anything to save.
   *
   * The form tracks its own fields; this screen adds the one kind of change the form cannot
   * see, because it is not a change to the hostel at all — a photo rejected here is a message
   * to the host, and it still has to enable Update.
   */
  protected readonly dirty = computed(
    () => (this.hostelForm()?.dirty() ?? false) || this.rejectedPhotos().size > 0,
  );

  /** Whether the user has attempted to save/approve — enables inline validation feedback. */
  protected readonly saveAttempted = signal(false);

  /**
   * What stands between this listing and Approve & publish.
   *
   * The field rules are the form's — one definition, asked of a record rather than a draft
   * via `requireComplete`, so the checklist here cannot drift from what the host was asked
   * for. The photo rule is this screen's own: the form counts photos, but only moderation
   * knows which of them have just been rejected, and a listing whose every photo was
   * rejected has none.
   */
  protected readonly validationErrors = computed<string[]>(() => {
    const form = this.hostelForm();
    if (!form) return [];
    const errs = Object.values(form.fieldErrors()).filter(
      (m): m is string => typeof m === 'string',
    );
    const live = form.photoCount() - this.rejectedPhotos().size;
    if (live <= 0 && !errs.some((e) => e.includes('photo')))
      errs.push('At least one photo is required');
    return errs;
  });

  constructor() {
    effect(() => {
      const d = this.state().data;
      if (!d) return;
      this.name.set(d.name);
      this.description.set(d.description);
      this.landmarks.set(d.landmarks);
      this.propertyType.set(d.propertyType);
      this.genderType.set(d.genderType);
      this.photos.set(d.photos.map((p) => ({ ...p })));
      this.photoLabelMap.set(
        new Map(
          d.photos.map((p) => [
            p.id,
            p.labelId != null ? String(p.labelId) : null,
          ]),
        ),
      );
      this.audit.set(d.audit.map((a) => ({ ...a })));
      this.flagged.set(false);
      this.decision.set(null);
      this.saved.set(false);
      this.saveError.set(false);
      this.approving.set(false);
      this.approveError.set(false);
      this.pendingAttachmentIds.set([]);
      this.newPhotoMap.set(new Map());
      this.saveAttempted.set(false);
      this.seedAmenities(d);
      // Seed editable location from the loaded hostel.
      const lat = d.lat !== null && d.lat !== undefined ? Number(d.lat) : null;
      const lng = d.lng !== null && d.lng !== undefined ? Number(d.lng) : null;
      this.locLat.set(Number.isFinite(lat) ? lat : null);
      this.locLng.set(Number.isFinite(lng) ? lng : null);
      this.locCountry.set(d.country);
      this.locCity.set(d.city === '—' ? '' : d.city);
      this.locState.set(d.state);
      this.locArea.set(d.area);
      this.locAddress1.set(d.address1);
    });
  }

  /** The form asked what "remove" means here. It means reject, once confirmed. */
  protected requestRemoveById(id: string): void {
    this.removeConfirmPhotoId.set(id);
  }

  /** Confirmed in the modal: the photo is rejected, and the host will be told. */
  protected confirmRemove(): void {
    const id = this.removeConfirmPhotoId();
    this.removeConfirmPhotoId.set(null);
    if (!id) return;
    this.rejectedPhotos.update((m) => new Map(m).set(id, 'flagged'));
    this.logAudit('Rejected photo (flagged)');
  }

  /** Undo, from the grid's own control on a rejected card. */
  protected undoRejectById(id: string): void {
    this.rejectedPhotos.update((m) => {
      const next = new Map(m);
      next.delete(id);
      return next;
    });
  }

  /** Per-photo Replace → pick a device image to overwrite this photo. */
  protected replace(photo: ReviewPhoto): void {
    this.replaceTarget.set(photo);
    this.fileInput().nativeElement.click();
  }

  private static readonly MAX_PHOTOS = 10;
  protected approve(): void {
    this.saveAttempted.set(true);
    if (this.validationErrors().length) {
      this.validationModalOpen.set(true);
      return;
    }
    const id = this.id();
    if (!id || this.approving()) return;
    this.approving.set(true);
    this.approveError.set(false);
    this.api
      .markAsActive(id)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.approving.set(false);
          this.decision.set('approve');
          this.logAudit('Approved & published');
          // Back to the queue: a moderator works through a list, and the listing they just
          // approved is no longer in it. Leaving them on a published page means their next
          // action is always the back button.
          void this.router.navigate(
            localiseCommands(['/moderator/queue'], this.locale.active()) as unknown[],
          );
        },
        error: () => {
          this.approving.set(false);
          this.approveError.set(true);
        },
      });
  }

  protected decisionMessage(): string {
    return this.decision() === 'approve'
      ? 'Listing approved & published — host notified.'
      : '';
  }

  protected decisionIcon(): string {
    return 'ti-rosette-discount-check';
  }

  protected decisionBannerClass(): string {
    return 'border-ok/30 bg-ok/5 text-ok';
  }

  protected queueTextClass(tone: ReviewDetail['daysInQueueTone']): string {
    return tone === 'danger'
      ? 'text-danger'
      : tone === 'warn'
        ? 'text-warn'
        : 'text-ok';
  }

  /** Up to two initials for the host avatar. */
  protected hostInitials(name: string): string {
    const parts = name
      .trim()
      .split(/\s+/)
      .filter((p) => p && p !== '—');
    if (!parts.length) return '–';
    return parts
      .slice(0, 2)
      .map((p) => p[0].toUpperCase())
      .join('');
  }

  /* ── editable amenities accordion ── */
  /** Pre-select the catalogue from the hostel's current offers (matched by slug). */
  private seedAmenities(d: ReviewDetail): void {
    const slugs = new Set(d.selectedOfferSlugs);
    const ids = new Set<string>();
    for (const cat of d.offerCatalog) {
      for (const o of cat.offers) {
        if (slugs.has(o.slug)) ids.add(o.id);
      }
    }
    this.selectedOfferIds.set(ids);
    this.showAll.set(false);
  }
  /** Persist all edits — core fields + amenities + rooms — to the hostel in one request
   *  (`PUT /api/hostels/:id`). Enabled only when something changed. */
  protected save(): void {
    this.saveAttempted.set(true);
    const id = this.id();
    const form = this.hostelForm();
    if (!id || !form || !this.dirty() || this.saving() || this.uploading()) return;
    if (this.validationErrors().length) return;

    this.saving.set(true);
    this.saveError.set(false);
    this.saved.set(false);
    // The same PUT the host console makes, with the same body — the form builds it. This
    // screen used to assemble its own, which is how it came to send four of a room type's
    // ten columns and none of the contact or billing fields.
    this.hostels
      .update(id, form.getPayload())
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (hostel) => {
          this.saving.set(false);
          this.saved.set(true);
          form.onSaveSuccess(hostel);
          this.logAudit('Updated hostel information');
        },
        error: () => {
          this.saving.set(false);
          this.saveError.set(true);
        },
      });
  }

  private logAudit(text: string): void {
    this.audit.update((list) => [
      {
        id: `live-${list.length}`,
        text,
        meta: 'Maria S. · just now',
        dot: 'brand',
      },
      ...list.map((a) => ({ ...a, dot: 'neutral' as const })),
    ]);
  }

  protected retry(): void {
    this.refresh.update((n) => n + 1);
  }
}
