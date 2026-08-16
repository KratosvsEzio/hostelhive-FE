import { TestBed } from '@angular/core/testing';
import { NotificationService } from './notification.service';

describe('NotificationService', () => {
  let service: NotificationService;

  beforeEach(() => {
    vi.useFakeTimers();
    TestBed.configureTestingModule({});
    service = TestBed.inject(NotificationService);
  });

  afterEach(() => {
    vi.clearAllTimers();
    vi.useRealTimers();
  });

  it('auto-dismisses after the ttl', () => {
    service.show({ kind: 'info', title: 'Saved' }, 6000);
    expect(service.toasts().length).toBe(1);
    vi.advanceTimersByTime(6000);
    expect(service.toasts().length).toBe(0);
  });

  it('pins a toast when ttl is 0', () => {
    service.show({ kind: 'error', title: 'Careful' }, 0);
    vi.advanceTimersByTime(60_000);
    expect(service.toasts().length).toBe(1);
  });

  it('coalesces an identical un-dismissed toast and refreshes its timer', () => {
    const first = service.show({ kind: 'error', title: 'Oops', message: 'again' }, 6000);
    vi.advanceTimersByTime(5000);
    const second = service.show({ kind: 'error', title: 'Oops', message: 'again' }, 6000);
    expect(second).toBe(first);
    expect(service.toasts().length).toBe(1);
    vi.advanceTimersByTime(5000);
    expect(service.toasts().length).toBe(1);
    vi.advanceTimersByTime(1000);
    expect(service.toasts().length).toBe(0);
  });

  it('does not coalesce toasts that differ in copy', () => {
    service.show({ kind: 'error', title: 'A' }, 0);
    service.show({ kind: 'error', title: 'B' }, 0);
    expect(service.toasts().length).toBe(2);
  });

  it('caps the stack, dropping the oldest', () => {
    for (let i = 0; i < 6; i++) service.show({ kind: 'info', title: `t${i}` }, 0);
    const titles = service.toasts().map((t) => t.title);
    expect(titles).toEqual(['t2', 't3', 't4', 't5']);
  });

  describe('muteErrors', () => {
    it('reports muted only while a hold is active', () => {
      expect(service.errorsMuted).toBe(false);
      const release = service.muteErrors(1500);
      expect(service.errorsMuted).toBe(true);
      release();
      // Still muted through the grace window, so in-flight rejections stay covered.
      vi.advanceTimersByTime(1499);
      expect(service.errorsMuted).toBe(true);
      vi.advanceTimersByTime(1);
      expect(service.errorsMuted).toBe(false);
    });

    it('stays muted until the last of several overlapping holds expires', () => {
      const a = service.muteErrors(1000);
      const b = service.muteErrors(5000);
      a();
      b();
      vi.advanceTimersByTime(1000);
      expect(service.errorsMuted).toBe(true);
      vi.advanceTimersByTime(4000);
      expect(service.errorsMuted).toBe(false);
    });

    it('lifts a zero-grace hold synchronously', () => {
      const release = service.muteErrors(0);
      expect(service.errorsMuted).toBe(true);
      release();
      expect(service.errorsMuted).toBe(false);
    });

    it('keeps covering when a graced hold is taken before a zero-grace one is released', () => {
      // The gate's pattern: a bounce takes its own graced hold, then the gate-wide hold lifts.
      const gate = service.muteErrors(0);
      const bounce = service.muteErrors(1500);
      gate();
      expect(service.errorsMuted).toBe(true);
      bounce();
      expect(service.errorsMuted).toBe(true);
      vi.advanceTimersByTime(1500);
      expect(service.errorsMuted).toBe(false);
    });

    it('ignores a release called more than once', () => {
      const release = service.muteErrors(1000);
      release();
      release();
      vi.advanceTimersByTime(1000);
      expect(service.errorsMuted).toBe(false);
      // A fresh hold must still mute — the double release must not have driven the count negative.
      service.muteErrors(1000);
      expect(service.errorsMuted).toBe(true);
    });
  });
});
