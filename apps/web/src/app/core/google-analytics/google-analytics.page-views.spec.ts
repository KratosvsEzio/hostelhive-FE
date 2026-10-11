import { Component, Type, WritableSignal, effect, inject, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { NavigationEnd, Router, RouterOutlet, provideRouter } from '@angular/router';
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
   */
  function configure(
    realSeo = false,
    ready: WritableSignal<boolean> = signal(true),
    page: Type<unknown> = Stub,
  ): void {
    TestBed.configureTestingModule({
      providers: [
        provideRouter([{ path: '**', component: page }]),
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
