import { TestBed } from '@angular/core/testing';
import { Capacitor } from '@capacitor/core';
import { MobileApp } from './mobile-app';

const PREVIEW_KEY = 'hh-mobile-preview';

/**
 * Point `matchMedia` at a width, so the phone query answers the way a real viewport would.
 *
 * Assigned rather than spied on: jsdom does not implement `matchMedia`, so there is no
 * property for `vi.spyOn` to wrap.
 */
function viewportWidth(px: number): void {
  (window as unknown as Record<string, unknown>)['matchMedia'] = (query: string) => {
    const max = /max-width:\s*(\d+)px/.exec(query);
    return {
      matches: max ? px <= Number(max[1]) : false,
      media: query,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
    } as unknown as MediaQueryList;
  };
}

/** jsdom will not let `location` be redefined, but it does honour a pushed URL. */
function search(qs: string): void {
  history.replaceState({}, '', `/${qs}`);
}

function mount(): MobileApp {
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({});
  return TestBed.inject(MobileApp);
}

describe('MobileApp', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    search('');
    viewportWidth(1280);
    vi.spyOn(Capacitor, 'isNativePlatform').mockReturnValue(false);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    // A plain assignment, so `restoreAllMocks` does not take it back off.
    delete (window as unknown as Record<string, unknown>)['matchMedia'];
    localStorage.clear();
    sessionStorage.clear();
  });

  describe('width', () => {
    it('is the web chrome on a desktop viewport', () => {
      expect(mount().isMobile()).toBe(false);
    });

    it('is the native chrome on a phone viewport', () => {
      viewportWidth(390);

      expect(mount().isMobile()).toBe(true);
    });

    // 768–1023 keeps the web chrome: the consoles have their own overlay drawer there.
    it('leaves tablets on the web chrome', () => {
      viewportWidth(768);

      expect(mount().isMobile()).toBe(false);
    });

    it('is the native chrome inside the packaged app, whatever the width', () => {
      vi.spyOn(Capacitor, 'isNativePlatform').mockReturnValue(true);

      expect(mount().isMobile()).toBe(true);
    });
  });

  /**
   * The demo pin.
   *
   * It used to be written to `localStorage`, which outlives the tab and the window — so one
   * `?mobile=1` demo left every later desktop session rendering phone chrome at any width,
   * with nothing on screen explaining why and a width test underneath that was working
   * correctly the whole time.
   */
  describe('?mobile pin', () => {
    it('pins the native chrome on a desktop viewport', () => {
      search('?mobile=1');

      expect(mount().isMobile()).toBe(true);
    });

    it('survives a reload in the same tab', () => {
      search('?mobile=1');
      mount();

      search('');
      expect(mount().isMobile()).toBe(true);
    });

    it('is lifted by ?mobile=0', () => {
      search('?mobile=1');
      mount();

      search('?mobile=0');
      expect(mount().isMobile()).toBe(false);
    });

    // The whole point of the move: a new tab is a clean desktop, not an inherited phone.
    it('does not outlive the tab', () => {
      search('?mobile=1');
      mount();
      expect(sessionStorage.getItem(PREVIEW_KEY)).toBe('1');

      sessionStorage.clear(); // what closing the tab does
      search('');

      expect(mount().isMobile()).toBe(false);
    });

    it('never reaches localStorage', () => {
      search('?mobile=1');
      mount();

      expect(localStorage.getItem(PREVIEW_KEY)).toBeNull();
    });

    /**
     * The migration that unsticks everyone already pinned. Without it the fix helps only
     * people who had never used the pin — the ones who are not stuck.
     */
    it('clears a pin left behind by the old build', () => {
      localStorage.setItem(PREVIEW_KEY, '1');

      const app = mount();

      expect(app.isMobile()).toBe(false);
      expect(localStorage.getItem(PREVIEW_KEY)).toBeNull();
    });

    it('still honours the width after the stale pin is cleared', () => {
      localStorage.setItem(PREVIEW_KEY, '1');
      viewportWidth(390);

      expect(mount().isMobile()).toBe(true);
    });
  });

  it('falls back to the platform when storage throws', () => {
    vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(() => {
      throw new Error('blocked');
    });

    expect(mount().isMobile()).toBe(false);
  });
});
