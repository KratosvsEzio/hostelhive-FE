import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { TranslocoService } from '@jsverse/transloco';
import { Subject } from 'rxjs';
import { provideI18nTesting } from '@core/i18n/provide-i18n-testing';
import {
  LOCALE_CHOSEN_STORAGE_KEY,
  LOCALE_STORAGE_KEY,
  LocaleStore,
} from './locale-store';

function store(): LocaleStore {
  return TestBed.inject(LocaleStore);
}

describe('LocaleStore', () => {
  beforeEach(() => {
    localStorage.clear();
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [provideRouter([]), provideI18nTesting()],
    });
  });

  it('records a switch as the visitor’s own decision', () => {
    const s = store();
    s.switchTo('de');

    expect(s.userChoice()).toBe('de');
    expect(localStorage.getItem(LOCALE_STORAGE_KEY)).toBe('de');
  });

  it('does not record an automatic switch as a decision', () => {
    const s = store();
    s.switchTo('de', 'auto');

    expect(s.active()).toBe('de');
    expect(s.userChoice()).toBeNull();
  });

  /**
   * The case the whole feature turns on.
   *
   * Someone in Germany who wants English picks `en` while already reading `en`, so the
   * switch is a no-op for everything except the record of having made it. Miss that and the
   * location guess moves them back to German on the next load — the exact complaint the
   * choice was meant to settle.
   */
  it('records picking the language already active', () => {
    const s = store();
    expect(s.active()).toBe('en');

    s.switchTo('en');

    expect(s.userChoice()).toBe('en');
    expect(localStorage.getItem(LOCALE_STORAGE_KEY)).toBe('en');
  });

  it('does not record an automatic no-op switch', () => {
    const s = store();
    s.switchTo('en', 'auto');

    expect(s.userChoice()).toBeNull();
  });

  it('reports no decision when only a value was stored', () => {
    localStorage.setItem(LOCALE_STORAGE_KEY, 'ur');

    expect(store().userChoice()).toBeNull();
  });

  /**
   * Retiring a language must not strand whoever had chosen it.
   *
   * The stored code is validated on the way out, so one this app no longer serves reads as
   * no choice and the location guess takes over again — rather than pinning the visitor to
   * a language nothing can render.
   */
  it('treats a language it no longer serves as no choice', () => {
    localStorage.setItem(LOCALE_CHOSEN_STORAGE_KEY, 'xx');

    expect(store().userChoice()).toBeNull();
  });

  // A visitor who resets wants the app guessing again, not to be pinned to whatever they
  // last had with nothing able to move them off it.
  it('drops the decision when forgotten', () => {
    const s = store();
    s.switchTo('de');
    s.forget();

    expect(s.userChoice()).toBeNull();
    expect(localStorage.getItem(LOCALE_CHOSEN_STORAGE_KEY)).toBeNull();
    expect(localStorage.getItem(LOCALE_STORAGE_KEY)).toBeNull();
  });

  it('ignores a code it does not recognise', () => {
    const s = store();
    s.switchTo('zz');

    expect(localStorage.getItem(LOCALE_STORAGE_KEY)).toBe('en');
  });
});

/**
 * That a Transloco event cannot change a signal on the stack that delivered it.
 *
 * Transloco answers a cache hit *synchronously*. The first "| transloco" pipe on a page
 * subscribes while Angular is evaluating the template, so the event comes straight back
 * down that same stack — and the signal write landed inside Angular's render phase, which
 * is NG0600: "Writing to signals is not allowed while Angular renders the template". It
 * surfaced on 29 fixtures of the onboarding wizard's suite and on well over a hundred
 * across the app.
 *
 * It never failed anything, which is why it survived. RxJS catches a throw inside a `next`
 * handler and re-reports it on a later tick, so the exception arrives detached from the
 * test that caused it — the suite logged it as an unhandled error and went green. Nor was
 * it development-only: the write is refused in every build, and refused *before* the
 * assignment, so the tick was being dropped rather than merely logged. A later emission
 * landing outside a render is what usually rescued `ready`.
 *
 * Asserted as the deferral rather than as a caught NG0600 for that same reason — the throw
 * is not catchable where it happens. What is observable is that `ready` does not move until
 * the microtask, and that is precisely what removing the scheduler would undo.
 */
describe('LocaleStore does not write signals on a Transloco emission', () => {
  /** Only the four members LocaleStore touches, so the emission can be driven by hand. */
  class FakeTransloco {
    readonly langChanges$ = new Subject<string>();
    readonly events$ = new Subject<unknown>();
    private table: Record<string, unknown> = {};

    getTranslation(): Record<string, unknown> {
      return this.table;
    }
    setActiveLang(): void {
      /* the store calls this on a switch; nothing here needs to happen */
    }

    /** A language file arriving: Transloco now holds it, and says so on the same stack. */
    deliver(): void {
      this.table = { hello: 'Hello' };
      this.events$.next({ type: 'translationLoadSuccess' });
    }
  }

  let transloco: FakeTransloco;

  beforeEach(() => {
    localStorage.clear();
    TestBed.resetTestingModule();
    transloco = new FakeTransloco();
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        { provide: TranslocoService, useValue: transloco },
      ],
    });
  });

  it('leaves ready() untouched on the emitting stack, and settles a microtask later', async () => {
    const s = store();
    expect(s.ready()).toBe(false);

    transloco.deliver();

    // The strings are in memory *now* — but the tick that lets `ready` notice is deferred,
    // so nothing has been written on this stack. Delete the scheduler and this reads true.
    expect(s.ready()).toBe(false);

    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(s.ready()).toBe(true);
  });

  /**
   * Guards the guard. If the fake never made `ready` true at all, the assertion above would
   * pass on a store that is simply broken, and the deferral would go untested.
   */
  it('does become ready once the tick lands, so the test above is measuring something', async () => {
    const s = store();
    transloco.deliver();
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(s.ready()).toBe(true);
  });
});
