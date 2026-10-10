import { isPlatformBrowser } from '@angular/common';
import {
  AfterViewInit,
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  PLATFORM_ID,
  ViewEncapsulation,
  inject,
  signal,
} from '@angular/core';
import { Router } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { Container } from '@hostelhive/ui';
import { PlaceResult, PlaceSearchField } from '@hostelhive/maps';
import { searchRouteFor } from '@util/location-slug';
import { SearchBar } from '@layout/components/search-bar/search-bar';
import { supportsAlphaWebm } from '@app/shared/mascot/mascot';
import { HeroSky } from '../hero-sky/hero-sky';

/** A hero scene: its photo, its headline and its label on the rail. Strings are keys. */
interface Scene {
  key: string;
  img: string;
  /** A 160 px crop for the rail, so a 58 px thumb never decodes a 2000 px photo. */
  thumb: string;
  alt: string;
  lead: string;
  accent: string;
  name: string;
  note: string;
}

const SCENES: Scene[] = [
  {
    key: 'rooftop',
    img: '/landing/scene-rooftop.webp',
    thumb: '/landing/scene-rooftop-thumb.webp',
    alt: 'home.sceneRooftopAlt',
    lead: 'home.sceneWelcomeLead',
    accent: 'home.sceneWelcomeAccent',
    name: 'home.sceneWelcome',
    note: 'home.sceneWelcomeNote',
  },
  {
    key: 'lounge',
    img: '/landing/scene-lounge.webp',
    thumb: '/landing/scene-lounge-thumb.webp',
    alt: 'home.sceneLoungeAlt',
    lead: 'home.scenePlacesLead',
    accent: 'home.scenePlacesAccent',
    name: 'home.scenePlaces',
    note: 'home.scenePlacesNote',
  },
  {
    key: 'exterior',
    img: '/landing/scene-exterior.webp',
    thumb: '/landing/scene-exterior-thumb.webp',
    alt: 'home.sceneExteriorAlt',
    lead: 'home.sceneCitiesLead',
    accent: 'home.sceneCitiesAccent',
    name: 'home.sceneCities',
    note: 'home.sceneCitiesNote',
  },
];

/** How long each scene holds before the next one rolls in. */
const HOLD_MS = 6000;
/** Length of a scene change through the clouds. */
const ROLL_MS = 1300;
/** How far a neighbouring thumb glides to clear the active ring. */
const PUSH_PX = 20;
/** Length of `hello.webp`: an image has no `ended` event, so the greeting is timed. */
const HELLO_MS = 1500;

type Clip = 'hello' | 'hover' | 'search';

// Each roll layer billows up from below, peaks around 0.75 and only partly veils the headline,
// then drifts up and away.
const ROLL_FRAMES: Keyframe[][] = [
  [
    { transform: 'translate3d(-6%, 62%, 0) scale(1.15)', opacity: 0 },
    { transform: 'translate3d(-2%, 34%, 0) scale(1.28)', opacity: 0.75, offset: 0.42 },
    { transform: 'translate3d(0, 24%, 0) scale(1.34)', opacity: 0.7, offset: 0.58 },
    { transform: 'translate3d(4%, -28%, 0) scale(1.46)', opacity: 0 },
  ],
  [
    { transform: 'scaleX(-1) translate3d(-10%, 70%, 0) scale(1.1)', opacity: 0 },
    { transform: 'scaleX(-1) translate3d(-4%, 40%, 0) scale(1.22)', opacity: 0.72, offset: 0.46 },
    { transform: 'scaleX(-1) translate3d(-2%, 28%, 0) scale(1.28)', opacity: 0.65, offset: 0.62 },
    { transform: 'scaleX(-1) translate3d(6%, -24%, 0) scale(1.4)', opacity: 0 },
  ],
  [
    { transform: 'translate3d(0, 45%, 0) scale(1.1)', opacity: 0 },
    { transform: 'translate3d(0, 14%, 0) scale(1.2)', opacity: 0.8, offset: 0.4 },
    { transform: 'translate3d(-3%, -12%, 0) scale(1.3)', opacity: 0 },
  ],
];

/**
 * The landing hero: three full-bleed scenes that change through rolling clouds under a large
 * headline, picked from a rail of round photos on an orbit ring. One search bar stays put
 * through every change, with the bee perched on its end — waving hello, hovering, flying
 * through the clouds on a scene change and holding up its magnifying glass only while the
 * search is in use.
 *
 * The server renders the first scene at rest; everything that moves starts in the browser.
 * With reduced motion the hero stays still and the thumbs switch scenes instantly.
 */
@Component({
  selector: 'app-hero-clouds',
  changeDetection: ChangeDetectionStrategy.OnPush,
  encapsulation: ViewEncapsulation.None,
  imports: [TranslocoPipe, Container, PlaceSearchField, SearchBar, HeroSky],
  templateUrl: './hero-clouds.html',
  styleUrl: './hero-clouds.scss',
})
export class HeroClouds implements AfterViewInit {
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);
  private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));

  protected readonly scenes = SCENES;

  // ── the compact phone search (the full bar handles its own) ──
  protected readonly place = signal('');
  private readonly lat = signal<number | null>(null);
  private readonly lng = signal<number | null>(null);

  protected onText(text: string): void {
    this.place.set(text);
    this.lat.set(null);
    this.lng.set(null);
  }

  protected onSelected(r: PlaceResult): void {
    this.place.set(r.label);
    this.lat.set(r.lat);
    this.lng.set(r.lng);
    this.search();
  }

  protected search(): void {
    const hasGeo = this.lat() !== null && this.lng() !== null;
    this.router.navigate(searchRouteFor(this.place()), {
      queryParams: {
        place: this.place() || null,
        city: hasGeo ? null : this.place() || null,
        lat: hasGeo ? this.lat() : null,
        lng: hasGeo ? this.lng() : null,
      },
    });
  }

  /** Set once the browser has wired the hero up; the thumbs do nothing before that. */
  private change: ((i: number) => void) | null = null;

  protected go(i: number): void {
    this.change?.(i);
  }

  ngAfterViewInit(): void {
    if (!this.isBrowser) return;
    const stop = this.start();
    this.destroyRef.onDestroy(stop);
  }

  /** Wires up the scenes, the rail, the bee and the scroll effect. Returns the teardown. */
  private start(): () => void {
    const root = this.host.nativeElement;
    const $ = <T extends Element = HTMLElement>(s: string) => root.querySelector(s) as T;
    const $$ = <T extends Element = HTMLElement>(s: string) => Array.from(root.querySelectorAll(s)) as T[];

    const hero = $('.hc');
    const sceneEls = $$('.hc-scene');
    const words = $$('.hc-word');
    const labs = $$('.hc-lab');
    const thumbs = $$<HTMLButtonElement>('.hc-th');
    const rail = $('.hc-rail');
    const spin = $('.hc-spin');
    const rolls = $$('.hc-roll');
    const rise = $('.hc-rise');
    const wash = $('.hc-wash');
    const scenesEl = $('.hc-scenes');
    const copyEls = [$('.hc-kicker'), $('.hc-words'), $('.hc-lede')];
    const beeBox = $('.hc-beebox');
    const beeVideo = $<HTMLVideoElement>('video.hc-bee');
    const beeImg = $<HTMLImageElement>('img.hc-bee');
    const searchEl = $('.hc-pill');

    const still = matchMedia('(prefers-reduced-motion: reduce)').matches;
    const alpha = supportsAlphaWebm(navigator.userAgent);
    const offs: (() => void)[] = [];
    const on = (el: EventTarget, ev: string, fn: EventListener, o?: AddEventListenerOptions) => {
      el.addEventListener(ev, fn, o);
      offs.push(() => el.removeEventListener(ev, fn, o));
    };

    let cur = 0;
    const setRail = (i: number) => {
      rail.style.setProperty('--i', String(i));
      thumbs.forEach((t, k) => {
        t.setAttribute('aria-pressed', String(k === i));
        t.style.setProperty('--off', `${Math.sign(k - i) * PUSH_PX}px`);
      });
      labs.forEach((l, k) => l.classList.toggle('on', k === i));
    };
    const setScene = (i: number) => sceneEls.forEach((s, k) => s.classList.toggle('on', k === i));
    const setWord = (i: number) => words.forEach((w, k) => w.classList.toggle('on', k === i));
    setRail(0);

    // Decode every scene photo once the page is idle. A crossfade to a photo the browser has not
    // decoded yet waits for the decode, which showed as a hitch on the first visit to each scene.
    const decodeAll = () =>
      sceneEls.forEach((s) => {
        const img = s.querySelector('img');
        if (!img) return;
        img.loading = 'eager';
        img.decode().catch(() => undefined);
      });
    if ('requestIdleCallback' in window) window.requestIdleCallback(decodeAll);
    else setTimeout(decodeAll, 1200);

    // ── the bee: one clip at a time ──
    let clip: Clip | null = null;
    let visible = true;
    let wantSearch = false;
    let greeted = false;
    let helloTimer = 0;
    const play = (k: Clip) => {
      if (still) {
        beeImg.src = k === 'search' ? '/mascot/still.webp' : '/mascot/hover-still.webp';
        return;
      }
      if (alpha) {
        if (clip !== k) {
          clip = k;
          beeVideo.loop = k !== 'hello';
          beeVideo.src = `/mascot/${k}.webm`;
        }
        if (visible && !document.hidden) beeVideo.play().catch(() => undefined);
        return;
      }
      // WebKit drops the WebM's alpha: the animated WebP instead, the greeting swapped on a timer.
      if (clip === k) return;
      clip = k;
      beeImg.src = `/mascot/${k}.webp`;
      clearTimeout(helloTimer);
      if (k === 'hello') helloTimer = window.setTimeout(() => play(wantSearch ? 'search' : 'hover'), HELLO_MS);
    };
    if (alpha && !still) {
      on(beeVideo, 'ended', () => {
        if (clip === 'hello') play(wantSearch ? 'search' : 'hover');
      });
      on(beeVideo, 'playing', () => beeBox.classList.add('live'));
    }
    // "Using the search": the pointer is over it, focus is inside it, or one of its popovers is open.
    const usingSearch = () =>
      searchEl.matches(':hover') ||
      searchEl.contains(document.activeElement) ||
      !!searchEl.querySelector('.hhsb-bar.is-open');
    const searchIn = () => {
      if (wantSearch) return;
      wantSearch = true;
      if (clip !== 'hello') play('search');
    };
    const searchOut = () => {
      if (usingSearch()) return;
      wantSearch = false;
      if (clip === 'search' || still) play('hover');
    };
    on(searchEl, 'pointerenter', searchIn);
    on(searchEl, 'focusin', searchIn);
    on(searchEl, 'pointerleave', () => setTimeout(searchOut, 0));
    on(searchEl, 'focusout', () => setTimeout(searchOut, 0));
    // A popover closing (a value picked, a click outside) ends the search too.
    on(document, 'click', () => setTimeout(searchOut, 0));

    if (still) {
      this.change = (i) => {
        cur = i;
        setRail(i);
        setScene(i);
        setWord(i);
      };
      return () => {
        offs.forEach((f) => f());
        this.change = null;
      };
    }

    // The bee flies up into the rolling clouds and comes back out of them.
    const fly = () => {
      const r = hero.getBoundingClientRect();
      const b = beeBox.getBoundingClientRect();
      const up = -Math.max(70, Math.min(220, (b.top - r.top) * 0.38));
      const far = -Math.max(120, Math.min(380, (b.left - r.left) * 0.45));
      beeBox.classList.add('flying');
      const a = beeBox.animate(
        [
          { transform: 'none' },
          { transform: `translate(${far * 0.3}px, ${up * 0.55}px) scale(.8) rotate(-8deg)`, offset: 0.22 },
          { transform: `translate(${far}px, ${up}px) scale(.56) rotate(-4deg)`, offset: 0.5 },
          { transform: `translate(${far * 0.45}px, ${up * 0.5}px) scale(.74) rotate(6deg)`, offset: 0.76 },
          { transform: 'none' },
        ],
        { duration: 1700, easing: 'cubic-bezier(.45,0,.25,1)' },
      );
      a.onfinish = a.oncancel = () => beeBox.classList.remove('flying');
      return a;
    };

    // ── scene change: a new click interrupts whatever change is running ──
    let flight: Animation[] = [];
    let steps: number[] = [];
    let busy = false;
    let t = 0;
    let p = 0;
    const halt = () => {
      steps.forEach(clearTimeout);
      steps = [];
      flight.forEach((a) => a.cancel());
      flight = [];
      words.forEach((w) => w.getAnimations().forEach((a) => a.cancel()));
    };
    const step = (fn: () => void, ms: number) => steps.push(window.setTimeout(fn, ms));
    offs.push(halt);

    const go = (i: number) => {
      if (i === cur) return;
      cur = i;
      t = 0;
      // Keep whichever headline is actually showing (mid-change it may be none), then start fresh.
      const shown = words.find((w) => w.classList.contains('on') && +getComputedStyle(w).opacity > 0.5);
      halt();
      busy = true;
      words.forEach((w) => w.classList.toggle('on', w === shown));
      setRail(i);
      rolls.forEach((im, k) =>
        flight.push(im.animate(ROLL_FRAMES[k], { duration: ROLL_MS, delay: k * 60, easing: 'cubic-bezier(.45,0,.3,1)' })),
      );
      if (p < 0.05) {
        flight.push(
          wash.animate([{ opacity: 0 }, { opacity: 0.25, offset: 0.45 }, { opacity: 0 }], {
            duration: ROLL_MS,
            easing: 'ease-in-out',
          }),
        );
      }
      if (shown && shown !== words[i]) {
        const out = shown.animate(
          [
            { opacity: 1, transform: 'none' },
            { opacity: 0, transform: 'translateY(-34px)' },
          ],
          { duration: 380, easing: 'cubic-bezier(.5,0,.75,0)', fill: 'forwards' },
        );
        out.onfinish = () => {
          shown.classList.remove('on');
          out.cancel();
        };
      }
      flight.push(fly());
      step(() => setScene(i), 360);
      step(() => {
        if (shown === words[i]) return;
        words[i].classList.add('on');
        words[i].animate(
          [
            { opacity: 0, transform: 'translateY(40px)' },
            { opacity: 0.55, transform: 'translateY(10px)', offset: 0.5 },
            { opacity: 1, transform: 'none' },
          ],
          { duration: 800, easing: 'cubic-bezier(.2,.7,.2,1)' },
        );
      }, 500);
      step(() => (busy = false), ROLL_MS);
    };
    this.change = go;

    // ── timeline: each scene holds, the orbit dot is the timer ──
    let last = performance.now();
    let raf = 0;
    let hovering = false;
    let focused = false;
    const paused = () => hovering || focused || !visible || document.hidden || p > 0.3;
    const tick = (now: number) => {
      const dt = Math.min(400, now - last);
      last = now;
      if (!paused() && !busy) {
        t += dt;
        if (t >= HOLD_MS) go((cur + 1) % SCENES.length);
      }
      spin.style.transform = `rotate(${((Math.min(t, HOLD_MS) / HOLD_MS) * 360).toFixed(1)}deg)`;
      raf = requestAnimationFrame(tick);
    };
    for (const el of [rail, searchEl]) {
      on(el, 'pointerenter', () => (hovering = true));
      on(el, 'pointerleave', () => (hovering = false));
    }
    on(hero, 'focusin', () => (focused = true));
    on(hero, 'focusout', () => setTimeout(() => (focused = hero.contains(document.activeElement))));

    const io = new IntersectionObserver(
      ([e]) => {
        visible = e.isIntersecting;
        if (!visible) {
          beeVideo.pause();
          return;
        }
        if (!greeted) {
          greeted = true;
          play(wantSearch ? 'search' : 'hello');
        } else if (clip) play(clip);
      },
      { threshold: 0.15 },
    );
    io.observe(hero);
    on(document, 'visibilitychange', () => {
      if (!document.hidden && visible && clip && alpha) beeVideo.play().catch(() => undefined);
    });

    // ── scroll: the clouds rise and swallow the hero as the page moves on ──
    let sraf = 0;
    const onScroll = () => {
      if (sraf) return;
      sraf = requestAnimationFrame(() => {
        sraf = 0;
        const r = hero.getBoundingClientRect();
        p = Math.min(1, Math.max(0, -r.top / (r.height * 0.72)));
        const e = p * p * (3 - 2 * p);
        rise.style.transform = `translate3d(0, ${(-e * 78).toFixed(2)}%, 0) scale(${(1 + e * 0.2).toFixed(3)})`;
        wash.style.opacity = (e * 0.55).toFixed(3);
        const ct = `translate3d(0, ${(-e * 70).toFixed(1)}px, 0)`;
        const co = Math.max(0, 1 - e * 1.3).toFixed(3);
        for (const el of [...copyEls, rail]) {
          el.style.transform = ct;
          el.style.opacity = co;
        }
        scenesEl.style.transform = `translate3d(0, ${(e * 16).toFixed(2)}%, 0)`;
      });
    };
    on(window, 'scroll', onScroll, { passive: true });
    on(window, 'resize', onScroll);
    onScroll();
    raf = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(raf);
      cancelAnimationFrame(sraf);
      clearTimeout(helloTimer);
      io.disconnect();
      offs.forEach((f) => f());
      beeVideo.pause();
      this.change = null;
    };
  }
}
