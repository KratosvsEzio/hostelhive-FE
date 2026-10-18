import { Component, Type, WritableSignal, effect, inject, signal } from '@angular/core';
import { Location } from '@angular/common';
import { TestBed } from '@angular/core/testing';
import { NavigationEnd, Router, RouterOutlet, Routes, provideRouter } from '@angular/router';
import { filter, firstValueFrom } from 'rxjs';
import { LocaleStore } from '../i18n/locale-store';
import { provideI18nTesting } from '../i18n/provide-i18n-testing';
import { Seo } from '../seo';
import { GoogleAnalyticsService } from './google-analytics.service';
import {
  clearGoogleAnalyticsConsent,
  setGoogleAnalyticsConsent,
} from './google-analytics-consent';

// The env file is generated and empty outside a release build; `start` is gated on its id.
vi.mock('@app/google-analytics.env', () => ({ googleAnalyticsEnv: { measurementId: 'G-TEST' } }));

@Component({ selector: 'hh-ga-stub', template: '' })
class Stub {}

@Component({ selector: 'hh-ga-host', imports: [RouterOutlet], template: '<router-outlet />' })
class Host {}

/** A page that owns its head the way the real ones do: written in an effect gated on `ready()`. */
@Component({ selector: 'hh-ga-page', template: '' })
class PageWithHead {
  constructor() {
    const seo = inject(Seo);
    const locale = inject(LocaleStore);
    effect(() => {
      if (locale.ready()) seo.apply({ title: 'Page own title' });
    });
  }
}

type Gtag = (...args: unknown[]) => void;

const SCRIPT_ID = 'ga4-gtag';
const CAP_MS = 5000;

describe('page views', () => {
  let gtag: ReturnType<typeof vi.fn<Gtag>>;
  let router: Router;
  let service: GoogleAnalyticsService;
  let settled: WritableSignal<boolean>;

  /**
   * Configures the module; `realSeo` swaps the stubbed head service for the real one, with
   * `ready` standing in for the locale's strings being loaded and `page` as the routed component.
   * `routes` replaces the catch-all route, for a test that needs a guard in the way.
   */
  function configure(
    realSeo = false,
    ready: WritableSignal<boolean> = signal(true),
    page: Type<unknown> = Stub,
    routes: Routes = [{ path: '**', component: page }],
  ): void {
    TestBed.configureTestingModule({
      providers: [
        provideRouter(routes),
        realSeo
          ? [
              provideI18nTesting(),
              { provide: LocaleStore, useValue: { active: signal('en'), ready } },
            ]
          : { provide: Seo, useValue: { settled } },
      ],
    });
    router = TestBed.inject(Router);
    // The test platform location leaves the address bar alone; a browser moves it before NavigationEnd.
    // Bound before the service binds, so the service reads the new address.
    router.events.subscribe((e) => {
      if (e instanceof NavigationEnd) history.replaceState(null, '', e.urlAfterRedirects);
    });
    service = TestBed.inject(GoogleAnalyticsService);
  }

  /**
   * `start` replaces `window.gtag`, so the spy goes in after it. Everything gtag is asked
   * to do before that (consent, config) is not under test here.
   */
  function startAndSpy(): void {
    service.start();
    gtag = vi.fn<Gtag>();
    window.gtag = gtag;
  }

  function views(): unknown[][] {
    return gtag.mock.calls.filter((c) => c[0] === 'event' && c[1] === 'page_view');
  }

  function viewAt(index: number): Record<string, unknown> {
    return views()[index][2] as Record<string, unknown>;
  }

  /**
   * Drives a settled page view to its send: the first macrotask creates the watcher, the
   * tick runs it, the next macrotask sends. Repeated so the order never matters to a caller.
   */
  async function settle(): Promise<void> {
    await vi.advanceTimersByTimeAsync(0);
    TestBed.tick();
    await vi.advanceTimersByTimeAsync(0);
    TestBed.tick();
    await vi.advanceTimersByTimeAsync(0);
  }

  /**
   * Presses Back and waits for the navigation it triggers. The router only listens to the
   * location once bootstrapped, which a test module never is, so the listener is attached here;
   * it defers the navigation by a macrotask, hence the timer advance.
   */
  async function back(): Promise<void> {
    router.setUpLocationChangeListener();
    const ended = firstValueFrom(router.events.pipe(filter((e) => e instanceof NavigationEnd)));
    TestBed.inject(Location).back();
    await vi.advanceTimersByTimeAsync(0);
    await ended;
    // The view was queued mid-tick, where a 0 ms timer is due 1 ms later; let it come due.
    await vi.advanceTimersByTimeAsync(1);
  }

  const origin = () => window.location.origin;

  beforeEach(() => {
    vi.useFakeTimers();
    settled = signal(true);
    // The script tag is already there, so `start` fetches nothing.
    const script = document.createElement('script');
    script.id = SCRIPT_ID;
    document.head.appendChild(script);
    setGoogleAnalyticsConsent('granted');
    document.title = 'Initial title';
  });

  afterEach(() => {
    // Restores the window listener spies even when an assertion in the test fails first.
    vi.restoreAllMocks();
    vi.useRealTimers();
    document.getElementById(SCRIPT_ID)?.remove();
    delete window.gtag;
    delete window.dataLayer;
    clearGoogleAnalyticsConsent();
    history.replaceState(null, '', '/');
  });

  describe('settling', () => {
    it('sends nothing in the navigation task and sends once the head has settled', async () => {
      configure();
      startAndSpy();

      await router.navigateByUrl('/en/hostel/abc');
      expect(views()).toHaveLength(0);
      TestBed.tick();
      expect(views()).toHaveLength(0);

      document.title = 'Cozy Hostel';
      await settle();

      expect(views()).toHaveLength(1);
      expect(viewAt(0)).toEqual({
        page_path: '/en/hostel/abc',
        page_location: `${origin()}/en/hostel/abc`,
        page_title: 'Cozy Hostel',
      });
    });

    it('waits while the page is not settled and sends the new title once it is', async () => {
      settled.set(false);
      configure();
      startAndSpy();

      document.title = 'Loading strings';
      await router.navigateByUrl('/ur/about');
      await vi.advanceTimersByTimeAsync(CAP_MS - 100);
      TestBed.tick();
      await vi.advanceTimersByTimeAsync(0);
      expect(views()).toHaveLength(0);

      document.title = 'ہمارے بارے میں';
      settled.set(true);
      TestBed.tick();
      await settle();

      expect(views()).toHaveLength(1);
      expect(viewAt(0)).toEqual({
        page_path: '/ur/about',
        page_location: `${origin()}/ur/about`,
        page_title: 'ہمارے بارے میں',
      });
      await vi.advanceTimersByTimeAsync(10_000);
      expect(views()).toHaveLength(1);
    });

    it('does not send a provisional listing head, and sends the loaded one', async () => {
      configure(true);
      const seo = TestBed.inject(Seo);
      startAndSpy();

      await router.navigateByUrl('/en/hostel/cozy');
      seo.apply({ title: 'Loading listing', provisional: true });
      TestBed.tick();
      await settle();
      expect(views()).toHaveLength(0);

      seo.apply({ title: 'Cozy Hostel | HostelHive' });
      TestBed.tick();
      await settle();

      expect(views()).toHaveLength(1);
      expect(viewAt(0)).toEqual({
        page_path: '/en/hostel/cozy',
        page_location: `${origin()}/en/hostel/cozy`,
        page_title: 'Cozy Hostel | HostelHive',
      });
    });

    // The last macrotask is what lets the page's own effect, run by the tick that settled the
    // head, write its title first; a send made inside that tick would record the old one.
    it('records the title the page writes when its strings finish loading', async () => {
      const ready = signal(false);
      configure(true, ready, PageWithHead);
      TestBed.createComponent(Host);
      startAndSpy();

      document.title = 'Previous page title';
      await router.navigateByUrl('/ur/about');
      await vi.advanceTimersByTimeAsync(0);
      TestBed.tick();
      await vi.advanceTimersByTimeAsync(CAP_MS - 100);
      TestBed.tick();
      expect(document.title).toBe('Previous page title');
      expect(views()).toHaveLength(0);

      ready.set(true);
      TestBed.tick();
      expect(document.title).toBe('Page own title');
      await settle();

      expect(views()).toHaveLength(1);
      expect(viewAt(0)).toEqual({
        page_path: '/ur/about',
        page_location: `${origin()}/ur/about`,
        page_title: 'Page own title',
      });
    });

    it('cancels a send when the head goes back to unsettled in the same tick', async () => {
      settled.set(false);
      configure();
      startAndSpy();

      await router.navigateByUrl('/en/hostel/abc');
      await vi.advanceTimersByTimeAsync(0);
      TestBed.tick();

      // Settled and unsettled again before any timer can run.
      settled.set(true);
      TestBed.tick();
      settled.set(false);
      TestBed.tick();
      await vi.advanceTimersByTimeAsync(100);
      expect(views()).toHaveLength(0);

      document.title = 'Final title';
      settled.set(true);
      TestBed.tick();
      await settle();

      expect(views()).toHaveLength(1);
      expect(viewAt(0)['page_title']).toBe('Final title');
    });

    it('sends at exactly the cap when the page never settles', async () => {
      settled.set(false);
      configure();
      startAndSpy();

      document.title = 'Whatever the tab shows';
      await router.navigateByUrl('/en/hostel/abc');
      await vi.advanceTimersByTimeAsync(CAP_MS - 1);
      TestBed.tick();
      expect(views()).toHaveLength(0);

      await vi.advanceTimersByTimeAsync(1);

      expect(views()).toHaveLength(1);
      expect(viewAt(0)).toEqual({
        page_path: '/en/hostel/abc',
        page_location: `${origin()}/en/hostel/abc`,
        page_title: 'Whatever the tab shows',
      });
      await vi.advanceTimersByTimeAsync(10_000);
      expect(views()).toHaveLength(1);
    });
  });

  describe('flushing', () => {
    // The next navigation flushes the waiting view after the router has already moved the
    // address bar; the abandoned page's view must keep the address it was queued at.
    it('flushes a waiting view with its own path and location on the next navigation', async () => {
      settled.set(false);
      configure();
      startAndSpy();

      await router.navigateByUrl('/en/hostel/abc');
      expect(views()).toHaveLength(0);

      await router.navigateByUrl('/en/search?place=Karachi');
      expect(views()).toHaveLength(1);
      expect(viewAt(0)).toEqual(
        expect.objectContaining({
          page_path: '/en/hostel/abc',
          page_location: `${origin()}/en/hostel/abc`,
        }),
      );

      await vi.advanceTimersByTimeAsync(CAP_MS);
      expect(views()).toHaveLength(2);
      expect(viewAt(1)).toEqual(
        expect.objectContaining({
          page_path: '/en/search',
          page_location: `${origin()}/en/search?place=Karachi`,
        }),
      );
    });

    it('flushes once on pagehide, and a later cap or settle sends nothing more', async () => {
      settled.set(false);
      configure();
      startAndSpy();

      document.title = 'Leaving';
      await router.navigateByUrl('/en/hostel/abc');
      window.dispatchEvent(new Event('pagehide'));

      expect(views()).toHaveLength(1);
      expect(viewAt(0)).toEqual({
        page_path: '/en/hostel/abc',
        page_location: `${origin()}/en/hostel/abc`,
        page_title: 'Leaving',
      });

      await vi.advanceTimersByTimeAsync(CAP_MS * 2);
      settled.set(true);
      TestBed.tick();
      await settle();
      expect(views()).toHaveLength(1);
    });

    it('never repeats a view that was already sent when the page settled', async () => {
      configure();
      startAndSpy();

      await router.navigateByUrl('/en/hostel/abc');
      await settle();
      expect(views()).toHaveLength(1);

      window.dispatchEvent(new Event('pagehide'));
      await vi.advanceTimersByTimeAsync(CAP_MS * 2);
      TestBed.tick();

      expect(views()).toHaveLength(1);
    });
  });

  describe('start', () => {
    it('queues the current page through the same wait when started mid-session', async () => {
      configure();
      await router.navigateByUrl('/en/search');
      startAndSpy();
      expect(views()).toHaveLength(0);

      document.title = 'Search';
      await settle();

      expect(views()).toHaveLength(1);
      expect(viewAt(0)).toEqual({
        page_path: '/en/search',
        page_location: `${origin()}/en/search`,
        page_title: 'Search',
      });
    });

    it('sends nothing at boot until the first navigation ends', async () => {
      configure();
      startAndSpy();
      await settle();
      await vi.advanceTimersByTimeAsync(CAP_MS * 2);
      expect(views()).toHaveLength(0);

      await router.navigateByUrl('/en/faqs');
      await settle();

      expect(views()).toHaveLength(1);
      expect(viewAt(0)['page_path']).toBe('/en/faqs');
    });

    it('adds no duplicate when called a second time', async () => {
      configure();
      await router.navigateByUrl('/en/search');
      service.start();
      service.start();
      gtag = vi.fn<Gtag>();
      window.gtag = gtag;

      await settle();
      service.start();
      await settle();
      await vi.advanceTimersByTimeAsync(CAP_MS * 2);

      expect(views()).toHaveLength(1);
    });
  });

  describe('same-page refinements', () => {
    const replace = (url: string) => router.navigateByUrl(url, { replaceUrl: true });

    it('sends one view with the arrival location and settled title when the map writes its viewport', async () => {
      configure(true);
      const seo = TestBed.inject(Seo);
      startAndSpy();

      await router.navigateByUrl('/en/search');
      seo.apply({ title: 'Loading search', provisional: true });
      TestBed.tick();
      await replace('/en/search?lat=24.8&lng=67');
      TestBed.tick();
      await settle();
      expect(views()).toHaveLength(0);

      seo.apply({ title: 'Hostels | HostelHive' });
      TestBed.tick();
      await settle();

      expect(views()).toHaveLength(1);
      expect(viewAt(0)).toEqual({
        page_path: '/en/search',
        page_location: `${origin()}/en/search`,
        page_title: 'Hostels | HostelHive',
      });
    });

    it('sends nothing more for pans after the arrival view, on a timer, or on pagehide', async () => {
      configure();
      startAndSpy();

      await router.navigateByUrl('/en/search');
      await settle();
      expect(views()).toHaveLength(1);

      for (const lat of [1, 2, 3]) await replace(`/en/search?lat=${lat}&lng=${lat}`);
      await settle();
      await vi.advanceTimersByTimeAsync(CAP_MS * 2);
      window.dispatchEvent(new Event('pagehide'));

      expect(views()).toHaveLength(1);
    });

    // The skip has to leave the waiting view alone: flushing it first would send the arrival
    // before its head settled, and the title recorded would be the previous page's.
    it('does not flush the waiting view when a replace follows the arrival', async () => {
      settled.set(false);
      configure();
      startAndSpy();

      document.title = 'Previous page title';
      await router.navigateByUrl('/en/search');
      await replace('/en/search?lat=1&lng=1');
      await vi.advanceTimersByTimeAsync(CAP_MS - 100);
      TestBed.tick();
      expect(views()).toHaveLength(0);

      document.title = 'Hostels | HostelHive';
      settled.set(true);
      TestBed.tick();
      await settle();

      expect(views()).toHaveLength(1);
      expect(viewAt(0)).toEqual({
        page_path: '/en/search',
        page_location: `${origin()}/en/search`,
        page_title: 'Hostels | HostelHive',
      });
    });

    it('does not count the replace that strips a discarded sort, and keeps the arrival location', async () => {
      configure();
      startAndSpy();

      await router.navigateByUrl('/en/search/lahore?sort=price-asc');
      // The navigation the search page issues to clean a sort it cannot honour out of the address.
      await router.navigate([], {
        queryParams: { sort: null },
        queryParamsHandling: 'merge',
        replaceUrl: true,
      });
      expect(router.url).toBe('/en/search/lahore');
      await settle();
      await vi.advanceTimersByTimeAsync(CAP_MS * 2);

      expect(views()).toHaveLength(1);
      expect(viewAt(0)).toEqual(
        expect.objectContaining({
          page_path: '/en/search/lahore',
          page_location: `${origin()}/en/search/lahore?sort=price-asc`,
        }),
      );
    });

    it('counts a pushed query change on the same path as its own view', async () => {
      configure();
      startAndSpy();

      await router.navigateByUrl('/en/search');
      await settle();
      await router.navigateByUrl('/en/search?gender=girls');
      await settle();

      expect(views()).toHaveLength(2);
      expect(viewAt(1)).toEqual(
        expect.objectContaining({
          page_path: '/en/search',
          page_location: `${origin()}/en/search?gender=girls`,
        }),
      );
    });

    it('counts a replace that moves to a different path', async () => {
      configure();
      startAndSpy();

      await router.navigateByUrl('/en/search');
      await settle();
      await replace('/en/about');
      await settle();

      expect(views()).toHaveLength(2);
      expect(viewAt(1)['page_path']).toBe('/en/about');
    });

    it('counts a first navigation that is a replace', async () => {
      configure();
      startAndSpy();

      await replace('/en/search');
      await settle();

      expect(views()).toHaveLength(1);
      expect(viewAt(0)['page_path']).toBe('/en/search');
    });

    it('keeps the location a mid-session start queued when a replace follows it', async () => {
      settled.set(false);
      configure();
      await router.navigateByUrl('/en/search');
      startAndSpy();

      await replace('/en/search?lat=1&lng=1');
      expect(views()).toHaveLength(0);

      document.title = 'Hostels | HostelHive';
      settled.set(true);
      TestBed.tick();
      await settle();

      expect(views()).toHaveLength(1);
      expect(viewAt(0)).toEqual({
        page_path: '/en/search',
        page_location: `${origin()}/en/search`,
        page_title: 'Hostels | HostelHive',
      });
    });

    it('sends one view for a listing opened with a review query, with the loaded title', async () => {
      configure(true);
      const seo = TestBed.inject(Seo);
      startAndSpy();

      await router.navigateByUrl('/en/hostel/abc?review=5');
      seo.apply({ title: 'Loading listing', provisional: true });
      TestBed.tick();
      await replace('/en/hostel/abc');
      TestBed.tick();
      await settle();
      expect(views()).toHaveLength(0);

      seo.apply({ title: 'Cozy Hostel | HostelHive' });
      TestBed.tick();
      await settle();

      expect(views()).toHaveLength(1);
      expect(viewAt(0)).toEqual({
        page_path: '/en/hostel/abc',
        page_location: `${origin()}/en/hostel/abc?review=5`,
        page_title: 'Cozy Hostel | HostelHive',
      });
    });

    it('does not count a move to a fragment of the same page', async () => {
      configure();
      startAndSpy();

      await router.navigateByUrl('/en/blog/x');
      await settle();
      await router.navigateByUrl('/en/blog/x#costs');
      await settle();
      await vi.advanceTimersByTimeAsync(CAP_MS * 2);

      expect(views()).toHaveLength(1);
      expect(viewAt(0)['page_path']).toBe('/en/blog/x');
    });

    it('does not count a fragment jump on a page opened with a query, and keeps the query in its location', async () => {
      configure();
      startAndSpy();

      await router.navigateByUrl('/en/blog/x?utm_source=fb');
      await settle();
      expect(views()).toHaveLength(1);
      await router.navigateByUrl('/en/blog/x?utm_source=fb#costs');
      await settle();
      await vi.advanceTimersByTimeAsync(CAP_MS * 2);

      expect(views()).toHaveLength(1);
      expect(viewAt(0)).toEqual(
        expect.objectContaining({
          page_path: '/en/blog/x',
          page_location: `${origin()}/en/blog/x?utm_source=fb`,
        }),
      );
    });

    it('records a page path without the fragment while keeping it in the location', async () => {
      configure();
      startAndSpy();

      document.title = 'Blog post';
      await router.navigateByUrl('/en/blog/x#costs');
      await settle();

      expect(views()).toHaveLength(1);
      expect(viewAt(0)).toEqual({
        page_path: '/en/blog/x',
        page_location: `${origin()}/en/blog/x#costs`,
        page_title: 'Blog post',
      });
    });

    // A console URL never queues a view, so only a pending marketplace view can show whether a
    // console navigation, or a skipped replace inside one, sends or flushes anything.
    it('sends a waiting marketplace view once, at the first console push, and nothing for a replace inside the console', async () => {
      settled.set(false);
      configure();
      startAndSpy();

      await router.navigateByUrl('/en/search');
      expect(views()).toHaveLength(0);

      await router.navigateByUrl('/en/host/1/rooms');
      expect(views()).toHaveLength(1);
      expect(viewAt(0)['page_path']).toBe('/en/search');

      await replace('/en/host/1/rooms?tab=2');
      await settle();
      await vi.advanceTimersByTimeAsync(CAP_MS * 2);

      expect(views()).toHaveLength(1);
      expect(gtag.mock.calls.filter((c) => c[0] === 'event')).toHaveLength(1);
    });

    it('records the title a page writes once its strings load, across a replace', async () => {
      const ready = signal(false);
      configure(true, ready, PageWithHead);
      TestBed.createComponent(Host);
      startAndSpy();

      document.title = 'Previous page title';
      await router.navigateByUrl('/ur/about');
      await vi.advanceTimersByTimeAsync(0);
      TestBed.tick();
      await vi.advanceTimersByTimeAsync(CAP_MS - 100);
      TestBed.tick();
      await replace('/ur/about?x=1');
      TestBed.tick();
      expect(document.title).toBe('Previous page title');
      expect(views()).toHaveLength(0);

      ready.set(true);
      TestBed.tick();
      expect(document.title).toBe('Page own title');
      await settle();

      expect(views()).toHaveLength(1);
      expect(viewAt(0)).toEqual({
        page_path: '/ur/about',
        page_location: `${origin()}/ur/about`,
        page_title: 'Page own title',
      });
    });
  });

  describe('history', () => {
    it('counts Back between two entries of the same path at its own location', async () => {
      configure();
      startAndSpy();

      await router.navigateByUrl('/en/search?place=A');
      await settle();
      await router.navigateByUrl('/en/search?place=B');
      await settle();
      expect(views()).toHaveLength(2);

      await back();
      await settle();

      expect(views()).toHaveLength(3);
      expect(viewAt(2)).toEqual(
        expect.objectContaining({
          page_path: '/en/search',
          page_location: `${origin()}/en/search?place=A`,
        }),
      );
    });

    it('counts Back across paths', async () => {
      configure();
      startAndSpy();

      await router.navigateByUrl('/en/hostel/abc');
      await settle();
      await router.navigateByUrl('/en/search');
      await settle();

      await back();
      await settle();

      expect(views()).toHaveLength(3);
      expect(viewAt(2)['page_path']).toBe('/en/hostel/abc');
    });

    it('counts a language switch pushed to the same page in another language', async () => {
      configure();
      startAndSpy();

      await router.navigateByUrl('/en');
      await settle();
      await router.navigateByUrl('/ur');
      await settle();

      expect(views()).toHaveLength(2);
      expect(viewAt(0)['page_path']).toBe('/en');
      expect(viewAt(1)['page_path']).toBe('/ur');
    });

    it('counts a guard redirect once, at the page it lands on', async () => {
      const redirect = () => inject(Router).createUrlTree(['/en/new']);
      configure(false, signal(true), Stub, [
        { path: 'en/old', component: Stub, canActivate: [redirect] },
        { path: '**', component: Stub },
      ]);
      startAndSpy();

      await router.navigateByUrl('/en/search');
      await settle();
      await router.navigateByUrl('/en/old');
      await settle();

      expect(views()).toHaveLength(2);
      expect(viewAt(1)).toEqual(
        expect.objectContaining({
          page_path: '/en/new',
          page_location: `${origin()}/en/new`,
        }),
      );
    });
  });

  describe('marketplace boundary', () => {
    it('sends none for a console URL', async () => {
      configure();
      startAndSpy();

      await router.navigateByUrl('/en/host/1/rooms');
      await settle();
      await vi.advanceTimersByTimeAsync(CAP_MS * 2);

      expect(views()).toHaveLength(0);
    });

    it('sends none for a token URL, but flushes the waiting marketplace view', async () => {
      settled.set(false);
      configure();
      startAndSpy();

      await router.navigateByUrl('/en/hostel/abc');
      await router.navigateByUrl('/en/reset_password?token=secret');

      expect(views()).toHaveLength(1);
      expect(viewAt(0)['page_path']).toBe('/en/hostel/abc');
      await vi.advanceTimersByTimeAsync(CAP_MS * 2);
      expect(views()).toHaveLength(1);
      expect(JSON.stringify(gtag.mock.calls)).not.toContain('secret');
    });

    it('flushes the waiting marketplace view when navigating into a console', async () => {
      settled.set(false);
      configure();
      startAndSpy();

      await router.navigateByUrl('/en/search');
      await router.navigateByUrl('/en/admin/payments');
      await vi.advanceTimersByTimeAsync(CAP_MS * 2);

      expect(views()).toHaveLength(1);
      expect(viewAt(0)['page_path']).toBe('/en/search');
    });

    it('sends no event from a console or a token URL, and sends from a listing', async () => {
      configure();
      startAndSpy();

      for (const url of ['/en/admin', '/en/reset_password?token=secret']) {
        await router.navigateByUrl(url);
        gtag.mockClear();
        service.track('lead_wall_shown', { intent: 'contact' });
        expect(gtag).not.toHaveBeenCalled();
      }

      await router.navigateByUrl('/en/hostel/x');
      gtag.mockClear();
      service.track('lead_wall_shown', { intent: 'contact' });
      expect(gtag).toHaveBeenCalledTimes(1);
      expect(gtag).toHaveBeenCalledWith('event', 'lead_wall_shown', { intent: 'contact' });
    });
  });

  describe('teardown', () => {
    it('cancels the waiting view without sending and removes the pagehide listener', async () => {
      settled.set(false);
      const added = vi.spyOn(window, 'addEventListener');
      const removed = vi.spyOn(window, 'removeEventListener');
      configure();
      startAndSpy();
      await router.navigateByUrl('/en/hostel/abc');
      const registered = added.mock.calls.find((c) => c[0] === 'pagehide');
      expect(registered).toBeDefined();

      TestBed.resetTestingModule();

      expect(removed).toHaveBeenCalledWith('pagehide', registered?.[1]);
      expect(views()).toHaveLength(0);
      await vi.advanceTimersByTimeAsync(CAP_MS * 2);
      window.dispatchEvent(new Event('pagehide'));
      expect(views()).toHaveLength(0);
    });
  });

  describe('stop', () => {
    // Consent Mode only stops storage: a view sent after "no" is still a request about the
    // visitor, so the one waiting is dropped and nothing is queued afterwards.
    it('drops a waiting view when consent is withdrawn, and queues none after', async () => {
      settled.set(false);
      configure();
      startAndSpy();
      await router.navigateByUrl('/en/hostel/abc');

      setGoogleAnalyticsConsent('denied');
      service.stop();

      expect(gtag).toHaveBeenCalledWith('consent', 'update', { analytics_storage: 'denied' });
      await vi.advanceTimersByTimeAsync(CAP_MS * 2);
      window.dispatchEvent(new Event('pagehide'));
      await router.navigateByUrl('/en/search');
      await vi.advanceTimersByTimeAsync(CAP_MS * 2);

      expect(views()).toHaveLength(0);
    });

    it('sends nothing after stop even if consent is still granted, until start runs again', async () => {
      configure();
      startAndSpy();
      await router.navigateByUrl('/en/hostel/abc');

      service.stop();
      await settle();
      await router.navigateByUrl('/en/search');
      await settle();
      await vi.advanceTimersByTimeAsync(CAP_MS * 2);
      service.track('lead_wall_shown', { intent: 'contact' });

      expect(views()).toHaveLength(0);
      expect(gtag.mock.calls.filter((c) => c[0] === 'event')).toHaveLength(0);

      startAndSpy();
      document.title = 'Search again';
      await settle();

      expect(views()).toHaveLength(1);
      expect(viewAt(0)).toEqual({
        page_path: '/en/search',
        page_location: `${origin()}/en/search`,
        page_title: 'Search again',
      });
      await vi.advanceTimersByTimeAsync(CAP_MS * 2);
      expect(views()).toHaveLength(1);
    });
  });
});
