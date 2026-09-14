import { Component, PLATFORM_ID, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { LazySrc } from './lazy-src';

@Component({
  imports: [LazySrc],
  template: `<img [hhLazySrc]="url()" alt="" />`,
})
class Host {
  readonly url = signal('https://example.test/photo.jpg');
}

/** Captures the observers the directive creates so a test can fire them by hand. */
interface FakeObserver {
  callback: IntersectionObserverCallback;
  target?: Element;
  options?: IntersectionObserverInit;
  disconnected: boolean;
}

/**
 * Why this exists rather than `loading="lazy"`.
 *
 * The attribute is the right instinct and it is not enough: Chrome scales its load-distance
 * margin with viewport height, and on a 790px phone that margin covered a whole 1451px photo
 * grid — all ten tiles fetched at once, 15.3 MB, one file 7.8 MB. It genuinely worked on a
 * short viewport, which is exactly what made it look correct. The distance has to be stated.
 */
describe('LazySrc', () => {
  let observers: FakeObserver[];
  const realIO = globalThis.IntersectionObserver;

  function installFakeObserver(): void {
    observers = [];
    globalThis.IntersectionObserver = class {
      private readonly record: FakeObserver;
      constructor(cb: IntersectionObserverCallback, options?: IntersectionObserverInit) {
        this.record = { callback: cb, options, disconnected: false };
        observers.push(this.record);
      }
      observe(target: Element): void {
        this.record.target = target;
      }
      disconnect(): void {
        this.record.disconnected = true;
      }
      unobserve(): void {
        /* not used */
      }
      takeRecords(): IntersectionObserverEntry[] {
        return [];
      }
    } as unknown as typeof IntersectionObserver;
  }

  function render(platform: unknown = 'browser'): ComponentFixture<Host> {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      imports: [Host],
      providers: [{ provide: PLATFORM_ID, useValue: platform }],
    });
    const fixture = TestBed.createComponent(Host);
    fixture.detectChanges();
    return fixture;
  }

  const imgOf = (f: ComponentFixture<Host>) =>
    (f.nativeElement as HTMLElement).querySelector('img') as HTMLImageElement;

  /** Fires the most recent observer as if its target had come into range. */
  function intersect(): void {
    const o = observers[observers.length - 1];
    o.callback([{ isIntersecting: true } as IntersectionObserverEntry], {} as IntersectionObserver);
  }

  beforeEach(() => installFakeObserver());
  afterAll(() => {
    globalThis.IntersectionObserver = realIO;
  });

  it('does not fetch anything until the image comes into range', () => {
    const fixture = render();

    expect(imgOf(fixture).getAttribute('src')).toBeNull();
    expect(observers.length).toBe(1);
    expect(observers[0].target).toBe(imgOf(fixture));
  });

  it('sets the source once it does', () => {
    const fixture = render();

    intersect();

    expect(imgOf(fixture).getAttribute('src')).toBe('https://example.test/photo.jpg');
  });

  // A loaded tile stays loaded when it scrolls away, and nothing re-runs.
  it('stops observing after the first hit', () => {
    render();

    intersect();

    expect(observers[0].disconnected).toBe(true);
  });

  // Far enough that a scrolling reader never watches a grey box fill in.
  // The failure this constant exists to avoid: a margin wider than the grid it guards
  // defers nothing. 600px covered the whole 1249px photo grid at 375px.
  it('keeps the margin small relative to what it guards', () => {
    render();

    expect(observers[0].options?.rootMargin).toBe('200px');
  });

  /**
   * On the server there is no viewport to intersect with. An `<img>` with no `src` in the
   * SSR payload is an image a crawler cannot see, so the fallback loads rather than defers.
   */
  it('writes the source directly on the server', () => {
    const fixture = render('server');

    expect(imgOf(fixture).getAttribute('src')).toBe('https://example.test/photo.jpg');
    expect(observers.length).toBe(0);
  });

  it('falls back to loading when the browser has no IntersectionObserver', () => {
    (globalThis as { IntersectionObserver?: unknown }).IntersectionObserver = undefined;

    const fixture = render();

    expect(imgOf(fixture).getAttribute('src')).toBe('https://example.test/photo.jpg');
  });
});
