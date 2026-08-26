import { TestBed } from '@angular/core/testing';
import { ConsoleDrawer, FULL_WIDTH, RAIL_WIDTH } from './console-drawer';

const KEY = 'hh.sidebar.expanded';

/** The service reads storage on construction, so each case seeds it before asking. */
function drawer(stored?: string): ConsoleDrawer {
  localStorage.clear();
  if (stored !== undefined) localStorage.setItem(KEY, stored);
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({});
  return TestBed.inject(ConsoleDrawer);
}

/**
 * Which sidebar a visitor gets.
 *
 * The rule is small but its edges matter: a console that quietly forgets an expanded sidebar
 * reads as the app losing your place, and one that starts expanded gives back 256px nobody
 * asked to spend.
 */
describe('ConsoleDrawer', () => {
  afterEach(() => localStorage.clear());

  it('starts as a rail of icons', () => {
    expect(drawer().railed()).toBe(true);
  });

  it('stays a rail whatever the window is', () => {
    Object.defineProperty(window, 'innerWidth', { value: 2560, configurable: true });
    expect(drawer().railed()).toBe(true);

    Object.defineProperty(window, 'innerWidth', { value: 900, configurable: true });
    expect(drawer().railed()).toBe(true);
  });

  it('expands and collapses on the chevron', () => {
    const d = drawer();

    d.toggleRail();
    expect(d.railed()).toBe(false);

    d.toggleRail();
    expect(d.railed()).toBe(true);
  });

  // Expanding once should not have to be done again every morning.
  it('remembers being expanded', () => {
    drawer().toggleRail();
    expect(localStorage.getItem(KEY)).toBe('1');
    expect(drawer('1').railed()).toBe(false);
  });

  it('remembers being collapsed again', () => {
    const d = drawer('1');
    d.toggleRail();

    expect(localStorage.getItem(KEY)).toBe('0');
    expect(drawer('0').railed()).toBe(true);
  });

  // Anything that is not an explicit opt-out means the default, so a stale or corrupted
  // value collapses rather than expanding into a state nobody chose.
  it('treats anything but an explicit yes as the default', () => {
    expect(drawer('0').railed()).toBe(true);
    expect(drawer('yes').railed()).toBe(true);
    expect(drawer('').railed()).toBe(true);
  });

  it('reports the width the content has to clear', () => {
    const d = drawer();
    expect(d.width_()).toBe(RAIL_WIDTH);

    d.toggleRail();
    expect(d.width_()).toBe(FULL_WIDTH);
  });
});
