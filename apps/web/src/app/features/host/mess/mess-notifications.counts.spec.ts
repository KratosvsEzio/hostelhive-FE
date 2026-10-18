import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { of } from 'rxjs';
import { provideI18nTesting } from '@core/i18n/provide-i18n-testing';
import { HostelsApi, HostPropertyStore } from '@services';
import { MessNotifications } from './mess-notifications';
import { MealType, MessNotificationsService } from './mess-notifications.service';

const MEALS: MealType[] = ['breakfast', 'lunch', 'dinner'];

/**
 * Renders the real template with every meal sent `hours` before it, and returns the page's
 * text. Keys render as themselves (provideI18nTesting), so the text names the key chosen.
 */
function pageText(hours: number): string {
  TestBed.configureTestingModule({
    imports: [MessNotifications],
    providers: [
      provideRouter([]),
      provideI18nTesting(),
      {
        provide: HostelsApi,
        useValue: { getWeeklyMenus: () => of([]), getMealTypes: () => of([]) },
      },
      { provide: HostPropertyStore, useValue: { selected: () => 'MjvuEl', timeZoneOf: () => of(null) } },
    ],
  });
  const fixture = TestBed.createComponent(MessNotifications);
  fixture.detectChanges();
  const svc = TestBed.inject(MessNotificationsService);
  for (const meal of MEALS) svc.updateMeal(meal, { enabled: true, notifyBefore: hours });
  fixture.detectChanges();
  return (fixture.nativeElement as HTMLElement).textContent ?? '';
}

/** The app has no plural rules, so a count of one asks for its own singular key. */
describe('MessNotifications confirmation window limit', () => {
  it.each([
    [1, 'hostMess.maxNHoursWindowOne'],
    [2, 'hostMess.maxNHoursWindow'],
  ])('words a %i-hour lead time as %s on every meal', (hours, key) => {
    expect(pageText(hours).match(/hostMess\.maxNHoursWindow(?:One)?/g)).toEqual([key, key, key]);
  });
});
