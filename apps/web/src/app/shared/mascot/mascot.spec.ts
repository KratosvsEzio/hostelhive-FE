import { PLATFORM_ID } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Mascot, MascotMode, supportsAlphaWebm } from './mascot';

const CHROME =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36';
const EDGE = `${CHROME} Edg/130.0`;
const FIREFOX = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:131.0) Gecko/20100101 Firefox/131.0';
const SAFARI =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_6) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15';
const IOS_CHROME =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/130.0 Mobile/15E148 Safari/604.1';

describe('supportsAlphaWebm', () => {
  it('trusts Blink and Gecko', () => {
    expect(supportsAlphaWebm(CHROME)).toBe(true);
    expect(supportsAlphaWebm(EDGE)).toBe(true);
    expect(supportsAlphaWebm(FIREFOX)).toBe(true);
  });

  // WebKit plays VP9 and drops the alpha: a black square where the page should show through.
  it('refuses WebKit, including every iOS browser', () => {
    expect(supportsAlphaWebm(SAFARI)).toBe(false);
    expect(supportsAlphaWebm(IOS_CHROME)).toBe(false);
  });
});

describe('Mascot', () => {
  let fixture: ComponentFixture<Mascot>;
  const realMatchMedia = globalThis.matchMedia;

  function create(mode: MascotMode, opts: { delay?: number; reduce?: boolean; server?: boolean } = {}) {
    globalThis.matchMedia = ((q: string) =>
      ({ matches: !!opts.reduce && q.includes('reduce') }) as MediaQueryList) as typeof matchMedia;
    TestBed.configureTestingModule({
      providers: [{ provide: PLATFORM_ID, useValue: opts.server ? 'server' : 'browser' }],
    });
    fixture = TestBed.createComponent(Mascot);
    fixture.componentRef.setInput('mode', mode);
    if (opts.delay) fixture.componentRef.setInput('delay', opts.delay);
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  }

  afterEach(() => {
    globalThis.matchMedia = realMatchMedia;
    vi.useRealTimers();
  });

  it('is decorative: hidden from assistive tech and sized square', () => {
    fixture = TestBed.createComponent(Mascot);
    fixture.componentRef.setInput('size', 96);
    fixture.detectChanges();
    const host = fixture.nativeElement as HTMLElement;
    expect(host.getAttribute('aria-hidden')).toBe('true');
    expect(host.style.width).toBe('96px');
    expect(host.style.height).toBe('96px');
  });

  it('shows the still pose without any video', () => {
    const el = create('still');
    expect(el.querySelector('img')?.getAttribute('src')).toBe('/mascot/still.webp');
    expect(el.querySelector('video')).toBeNull();
  });

  it('renders nothing on the server', () => {
    const el = create('searching', { server: true });
    expect(el.querySelector('img, video')).toBeNull();
  });

  it('gives the still pose to anyone who asked for less motion', () => {
    const el = create('searching', { reduce: true });
    expect(el.querySelector('video')).toBeNull();
    expect(el.querySelector('img')?.getAttribute('src')).toBe('/mascot/still.webp');
  });

  it('holds back until the delay runs out, so a fast answer never flashes it', () => {
    vi.useFakeTimers();
    const el = create('still', { delay: 300 });
    expect(el.querySelector('img')).toBeNull();
    vi.advanceTimersByTime(300);
    fixture.detectChanges();
    expect(el.querySelector('img')).not.toBeNull();
  });

  // The test DOM reports a WebKit engine, so this is the Safari path: animated WebP.
  it('swaps the WebP entrance for the search loop when the entrance ends', () => {
    vi.useFakeTimers();
    const el = create('searching');
    expect(navigator.userAgent).toContain('AppleWebKit');
    const img = el.querySelector('img') as HTMLImageElement;
    expect(img.getAttribute('src')).toBe('/mascot/enter.webp');
    // The clock starts when the entrance has arrived, not at mount.
    vi.advanceTimersByTime(2000);
    fixture.detectChanges();
    expect(img.getAttribute('src')).toBe('/mascot/enter.webp');
    img.dispatchEvent(new Event('load'));
    vi.advanceTimersByTime(900);
    fixture.detectChanges();
    expect(el.querySelector('img')?.getAttribute('src')).toBe('/mascot/search.webp');
  });
});
