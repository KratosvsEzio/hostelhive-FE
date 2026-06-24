import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  signal,
} from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { catchError, map, of, startWith, switchMap } from 'rxjs';
import { AMENITIES, Gender } from '@hostelhive/data-access';
import { Avatar, Badge, Button, EmptyState, Skeleton } from '@hostelhive/ui';
import { ListingDetailApi } from '@services';
import { ListingDetail as ListingDetailModel } from '@services/listing-detail.fixture';

interface ViewState {
  loading: boolean;
  error: boolean;
  data: ListingDetailModel | null;
}

/** Tint backgrounds cycled across the room cards (matches mockup 03). */
const ROOM_TINTS = [
  'bg-tint-cream',
  'bg-tint-mint',
  'bg-tint-sky',
  'bg-tint-purple',
  'bg-tint-blue',
];

@Component({
  selector: 'hh-listing-detail',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    DecimalPipe,
    RouterLink,
    Avatar,
    Badge,
    Button,
    EmptyState,
    Skeleton,
  ],
  templateUrl: './listing-detail.html',
  styles: `
    /* Faux map — CSS grid background mimicking map tiles (no @angular/google-maps). */
    .hh-mapfaux {
      background-color: #eaf0ec;
      background-image:
        linear-gradient(#dfe7e1 1px, transparent 1px),
        linear-gradient(90deg, #dfe7e1 1px, transparent 1px);
      background-size: 38px 38px;
    }
  `,
})
export class ListingDetail {
  private readonly api = inject(ListingDetailApi);
  private readonly route = inject(ActivatedRoute);

  /**
   * Gate stub — flips to `true` on "Show phone number". The real Lead Wall
   * (sign-in + contact reveal) is a separate lib; this is a local toggle only.
   */
  protected readonly revealed = signal(false);

  /** Stubbed contact — gated behind {@link revealed}. */
  protected readonly phoneRaw = '+92 311 234 5678';
  private readonly phoneMasked = '+92 3•• ••• ••••';

  protected readonly skeletons = [1, 2, 3];

  protected readonly state = toSignal(
    this.route.paramMap.pipe(
      map((p) => p.get('slug') ?? ''),
      switchMap((slug) =>
        this.api.getBySlug(slug).pipe(
          map(
            (data): ViewState => ({
              loading: false,
              error: false,
              data: data ?? null,
            }),
          ),
          startWith<ViewState>({ loading: true, error: false, data: null }),
          catchError(() =>
            of<ViewState>({ loading: false, error: true, data: null }),
          ),
        ),
      ),
    ),
    { initialValue: { loading: true, error: false, data: null } as ViewState },
  );

  /** Gallery thumbnails — every image after the hero. */
  protected readonly thumbs = computed(
    () => this.state().data?.images.slice(1) ?? [],
  );

  /** Amenity rows from the canonical AMENITIES map (icon + label). */
  protected readonly amenityList = computed(() =>
    (this.state().data?.amenities ?? []).map((key) => ({
      key,
      icon: AMENITIES[key]?.icon ?? 'ti-point',
      label: AMENITIES[key]?.label ?? key,
    })),
  );

  protected readonly roomSummary = computed(() => {
    const l = this.state().data;
    if (!l?.rooms?.length) return '';
    const beds = l.rooms.reduce((sum, r) => sum + r.capacity, 0);
    return `${beds} beds · ${l.rooms.length} room types · ${l.sharing.length} sharing options`;
  });

  protected readonly sharingSummary = computed(() => {
    const sharing = this.state().data?.sharing ?? [];
    const labels = sharing.map((s) => s.replace('-sharing', ''));
    return labels.length ? `${labels.join(', ')}-sharing available` : '';
  });

  protected readonly phoneDisplay = computed(() =>
    this.revealed() ? this.phoneRaw : this.phoneMasked,
  );

  protected reveal(): void {
    this.revealed.set(true);
  }

  protected roomTint(index: number): string {
    return ROOM_TINTS[index % ROOM_TINTS.length];
  }

  protected genderLabel(g: Gender): string {
    return g === 'coliving' ? 'Co-living' : g === 'boys' ? 'Boys' : 'Girls';
  }

  protected initials(name: string): string {
    return name
      .split(' ')
      .map((part) => part[0])
      .join('')
      .slice(0, 2)
      .toUpperCase();
  }
}
