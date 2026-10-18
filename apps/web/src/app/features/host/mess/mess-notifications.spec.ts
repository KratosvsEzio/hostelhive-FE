import { TestBed } from '@angular/core/testing';
import { of, throwError } from 'rxjs';
import { HostelsApi, HostPropertyStore } from '@services';
import { MessNotifications } from './mess-notifications';

const HOSTEL_ID = 'MjvuEl';
const QUIET = { suppressErrorToast: true };

/** The component's members are `protected`; the spec drives them through this shape. */
interface Internals {
  saveMenu(): void;
  saveSettings(): void;
  menuSaveState(): string;
  settingsSaveState(): string;
}

/**
 * A failed save is shown on its own save button, translated, and only there: both saves opt
 * out of the global toast, which would otherwise repeat it.
 */
describe('MessNotifications save failures', () => {
  let saveWeeklyMenus: ReturnType<typeof vi.fn>;
  let saveMealTypes: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.useFakeTimers();
    saveWeeklyMenus = vi.fn(() => throwError(() => ({ status: 500 })));
    saveMealTypes = vi.fn(() => throwError(() => ({ status: 422, serverMessages: ['Meal time is invalid'] })));
    TestBed.configureTestingModule({
      imports: [MessNotifications],
      providers: [
        {
          provide: HostelsApi,
          useValue: { getWeeklyMenus: () => of([]), getMealTypes: () => of([]), saveWeeklyMenus, saveMealTypes },
        },
        { provide: HostPropertyStore, useValue: { selected: () => HOSTEL_ID, timeZoneOf: () => of(null) } },
      ],
    }).overrideComponent(MessNotifications, { set: { template: '', imports: [] } });
  });

  afterEach(() => vi.useRealTimers());

  function open(): Internals {
    const fixture = TestBed.createComponent(MessNotifications);
    fixture.detectChanges();
    return fixture.componentInstance as unknown as Internals;
  }

  it('saves the weekly menu quietly and shows the failure on its button', () => {
    const page = open();

    page.saveMenu();

    expect(saveWeeklyMenus).toHaveBeenCalledWith(HOSTEL_ID, expect.anything(), QUIET);
    expect(page.menuSaveState()).toBe('error');
  });

  it('saves the meal times quietly and shows the failure on its button', () => {
    const page = open();

    page.saveSettings();

    expect(saveMealTypes).toHaveBeenCalledWith(HOSTEL_ID, expect.anything(), QUIET);
    expect(page.settingsSaveState()).toBe('error');
  });
});
