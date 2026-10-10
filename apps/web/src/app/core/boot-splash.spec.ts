import { Component, PLATFORM_ID, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { BOOT_MIN_MS, liftBootSplashWhenReady } from './boot-splash';

const busy = signal(true);

@Component({ template: '' })
class Root {
  constructor() {
    liftBootSplashWhenReady(busy);
  }
}

describe('liftBootSplashWhenReady', () => {
  let splash: HTMLElement;

  function boot(platform = 'browser'): void {
    TestBed.configureTestingModule({ providers: [{ provide: PLATFORM_ID, useValue: platform }] });
    TestBed.createComponent(Root);
    TestBed.tick();
  }

  beforeEach(() => {
    vi.useFakeTimers();
    vi.spyOn(performance, 'now').mockReturnValue(0);
    busy.set(true);
    splash = document.createElement('div');
    splash.id = 'hh-boot';
    document.body.append(splash);
  });

  afterEach(() => {
    splash.remove();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('stays up while startup is still resolving', () => {
    boot();
    vi.advanceTimersByTime(5000);
    expect(splash.isConnected).toBe(true);
    expect(splash.classList).not.toContain('hh-boot-out');
  });

  // A fast start must still let the bee land and wave, or the splash reads as a flicker.
  it('holds for the minimum dwell, then fades and is removed', () => {
    busy.set(false);
    boot();
    vi.advanceTimersByTime(BOOT_MIN_MS - 1);
    expect(splash.classList).not.toContain('hh-boot-out');
    vi.advanceTimersByTime(1);
    expect(splash.classList).toContain('hh-boot-out');
    vi.advanceTimersByTime(400);
    expect(splash.isConnected).toBe(false);
  });

  it('lifts as soon as startup resolves when the dwell has already passed', () => {
    vi.mocked(performance.now).mockReturnValue(BOOT_MIN_MS + 500);
    boot();
    busy.set(false);
    TestBed.tick();
    vi.advanceTimersByTime(0);
    expect(splash.classList).toContain('hh-boot-out');
  });

  it('waits again for a startup claim that begins inside the dwell', () => {
    busy.set(false);
    boot();
    vi.advanceTimersByTime(BOOT_MIN_MS / 2);
    busy.set(true);
    TestBed.tick();
    vi.advanceTimersByTime(BOOT_MIN_MS * 2);
    expect(splash.classList).not.toContain('hh-boot-out');
  });

  it('leaves the server alone', () => {
    busy.set(false);
    boot('server');
    vi.advanceTimersByTime(5000);
    expect(splash.classList).not.toContain('hh-boot-out');
  });
});
