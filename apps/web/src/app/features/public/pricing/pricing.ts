import {
  ChangeDetectionStrategy,
  Component,
  PLATFORM_ID,
  computed,
  effect,
  inject,
  signal,
  untracked,
} from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { RouterLink } from '@angular/router';
import { toObservable, toSignal } from '@angular/core/rxjs-interop';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { Observable, catchError, map, of, startWith, switchMap } from 'rxjs';
import {
  Button,
  Container,
  EmptyState,
  ErrorState,
  Skeleton,
} from '@hostelhive/ui';
import type { PublicPlan } from '@hostelhive/data-access';
import { HOST_ROLES, SessionStore } from '@core/auth';
import { GeoPreference } from '@core/geo/geo-preference';
import { LocaleLink } from '@core/i18n/locale-link';
import { LocaleStore } from '@core/i18n/locale-store';
import { Seo } from '@core/seo';
import { BillingApi, HostPropertyStore } from '@services';
import { PlanCard } from '@app/shared/billing/plan-card';

/** The country is known to be unknown: the server prices for its own guess, then USD. */
const NO_COUNTRY = '';

/** How many placeholder cards stand in for the plan grid until it loads. */
const SKELETON_CARDS = [0, 1, 2, 3] as const;

type PlansState =
  | { status: 'loading' }
  | { status: 'ready'; currency: string; plans: PublicPlan[] }
  | { status: 'failed' };

const LOADING: PlansState = { status: 'loading' };
const FAILED: PlansState = { status: 'failed' };

interface PlanCta {
  labelKey: string;
  link: string;
}

/**
 * The public pricing page: what each plan costs and includes, priced for where the reader is.
 *
 * The copy is server-rendered; the plans are fetched in the browser only. A server request
 * carries no visitor country, and the hydration transfer cache would then pin every visitor
 * to whatever the server was priced for.
 *
 * For a signed-in host the hostel list is loaded here when nothing has loaded it yet, and
 * the plans wait for it: the persisted selection is never trusted on its own. The country is
 * that validated hostel's, otherwise the visitor's detected country once that lookup has
 * settled, otherwise none. Checkout never starts here; hosts are sent to their billing screen.
 */
@Component({
  selector: 'app-pricing',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    Container,
    Button,
    EmptyState,
    ErrorState,
    Skeleton,
    PlanCard,
    RouterLink,
    LocaleLink,
    TranslocoPipe,
  ],
  templateUrl: './pricing.html',
})
export class Pricing {
  private readonly billingApi = inject(BillingApi);
  private readonly session = inject(SessionStore);
  private readonly properties = inject(HostPropertyStore);
  private readonly geo = inject(GeoPreference);
  private readonly seo = inject(Seo);
  private readonly i18n = inject(TranslocoService);
  private readonly locale = inject(LocaleStore);
  private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));

  protected readonly skeletonCards = SKELETON_CARDS;

  private readonly isHost = computed(() => this.session.hasRole(...HOST_ROLES));

  /** A host whose hostel list has not resolved yet; pricing waits rather than re-pricing later. */
  private readonly awaitingHostels = computed(
    () => this.isHost() && !this.properties.loaded(),
  );

  /** The validated hostel a signed-in host is working in, or null for everyone else. */
  private readonly hostHostel = computed(() =>
    this.isHost() && this.properties.loaded()
      ? (this.properties.activeHostel() ?? null)
      : null,
  );

  private readonly hostelId = computed(() => this.hostHostel()?.id || null);

  /** The country to price for: a code, {@link NO_COUNTRY}, or null while the lookup is still out. */
  private readonly country = computed<string | null>(() => {
    if (this.awaitingHostels()) return null;
    const hostCountry = this.hostHostel()?.countryCode;
    if (hostCountry) return hostCountry;
    const geoCountry = this.geo.countryCode();
    if (geoCountry) return geoCountry;
    return this.geo.countrySettled() ? NO_COUNTRY : null;
  });

  private readonly attempt = signal(0);

  private hostelsRequested = false;

  private readonly request = computed(() => ({
    country: this.country(),
    attempt: this.attempt(),
  }));

  private readonly state = toSignal(
    this.isBrowser
      ? toObservable(this.request).pipe(
          switchMap(({ country }) =>
            country === null ? of(LOADING) : this.fetch(country),
          ),
        )
      : of(LOADING),
    { initialValue: LOADING },
  );

  protected readonly loading = computed(
    () => this.state().status === 'loading',
  );
  protected readonly failed = computed(() => this.state().status === 'failed');

  private readonly ready = computed(() => {
    const state = this.state();
    return state.status === 'ready' ? state : null;
  });

  protected readonly plans = computed(() => this.ready()?.plans ?? []);
  protected readonly isEmpty = computed(
    () => this.ready() !== null && this.plans().length === 0,
  );

  protected readonly currencyKey = computed(() => {
    const ready = this.ready();
    if (!ready) return null;
    return ready.currency === 'PKR'
      ? 'publicPricing.currencyPkr'
      : 'publicPricing.currencyUsd';
  });

  protected readonly cta = computed<PlanCta>(() => {
    const hostelId = this.hostelId();
    return hostelId
      ? {
          labelKey: 'publicPricing.goToBilling',
          link: `/host/${hostelId}/subscription`,
        }
      : { labelKey: 'publicPricing.startHosting', link: '/host/listings/new' };
  });

  constructor() {
    // Re-runs on a language change, once that language's strings have loaded.
    effect(() => {
      if (!this.locale.ready()) return;
      this.seo.apply({
        title: this.i18n.translate('seo.pricingTitle'),
        description: this.i18n.translate('seo.pricingDescription'),
        path: '/pricing',
      });
    });

    // A host arriving here directly has no hostel list yet; fetch it once, in the browser only.
    if (this.isBrowser) {
      effect(() => {
        if (!this.awaitingHostels() || this.hostelsRequested) return;
        this.hostelsRequested = true;
        untracked(() => this.properties.load());
      });
    }
  }

  protected retry(): void {
    this.attempt.update((n) => n + 1);
  }

  private fetch(country: string): Observable<PlansState> {
    return this.billingApi.plans(country || undefined).pipe(
      map(
        ({ currency, plans }): PlansState => ({
          status: 'ready',
          currency,
          plans: plans.filter((plan) => plan.price !== null),
        }),
      ),
      catchError(() => of(FAILED)),
      startWith(LOADING),
    );
  }
}
