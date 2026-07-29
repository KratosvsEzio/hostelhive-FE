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
});
