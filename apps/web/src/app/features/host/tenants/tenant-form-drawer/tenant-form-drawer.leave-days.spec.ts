import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { of } from 'rxjs';
import { vi } from 'vitest';
import { NotificationService } from '@core/notification.service';
import { provideI18nTesting } from '@core/i18n/provide-i18n-testing';
import { HostOpsApi, HostPropertyStore, ImageUploadService } from '@services';
import { HostBookingsApi } from '@features/host/bookings/host-bookings-api';
import { HOSTEL_ID } from '@app/testing/host-builders';
import { HostBookingsApiStub, HostOpsApiStub } from '@app/testing/host-stubs';
import { CheckInForm, emptyCheckInForm } from './tenant-form.model';
import { TenantFormDrawer } from './tenant-form-drawer';

/** 2026-03-15 12:00Z, the 15th in Karachi. */
const NOW = Date.UTC(2026, 2, 15, 12, 0);
const KARACHI = 'Asia/Karachi';

/** The drawer's own state the leave confirmation reads. */
interface Drawer {
  form: { (): CheckInForm | null; set(f: CheckInForm): void };
  leaveConfirmOpen: { set(open: boolean): void };
}

/**
 * Renders the real template with the leave confirmation open for a new tenant leaving on
 * `leaveDate`, and returns the dialog's text. Keys render as themselves (provideI18nTesting),
 * so the text names the key the template chose.
 */
async function confirmationText(leaveDate: string): Promise<string> {
  TestBed.configureTestingModule({
    providers: [
      provideI18nTesting(),
      { provide: HostOpsApi, useValue: new HostOpsApiStub() },
      { provide: HostBookingsApi, useValue: new HostBookingsApiStub() },
      {
        provide: HostPropertyStore,
        useValue: {
          selected: signal(HOSTEL_ID),
          isMonthlyBilled: () => true,
          timeZoneOf: () => of(KARACHI),
        },
      },
      { provide: ImageUploadService, useValue: {} },
      { provide: NotificationService, useValue: {} },
    ],
  });
  const fixture = TestBed.createComponent(TenantFormDrawer);
  fixture.componentRef.setInput('mode', 'create');
  fixture.detectChanges();
  const drawer = fixture.componentInstance as unknown as Drawer;

  drawer.form.set({ ...emptyCheckInForm(), leaveDate });
  drawer.leaveConfirmOpen.set(true);
  fixture.detectChanges();
  await fixture.whenStable();
  fixture.detectChanges();

  // The drawer is a dialog too; the confirmation is the one titled confirmLeaveDate.
  const dialogs = (fixture.nativeElement as HTMLElement).querySelectorAll('[role="dialog"]');
  const confirm = [...dialogs].find((d) => d.textContent?.includes('hostTenants.confirmLeaveDate'));
  return confirm?.textContent ?? '';
}

/** Every day-count key the dialog shows, so one assertion rules out the others. */
function dayKeys(text: string): string[] {
  return text.match(/hostTenants\.nDays\w+|common\.today/g) ?? [];
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(NOW);
});

afterEach(() => vi.useRealTimers());

describe('TenantFormDrawer leave confirmation day count', () => {
  it.each([
    ['2026-03-16', 'one day ahead', 'hostTenants.nDaysFromTodayOne'],
    ['2026-03-17', 'two days ahead', 'hostTenants.nDaysFromToday'],
    ['2026-03-15', 'today', 'common.today'],
    ['2026-03-14', 'one day back', 'hostTenants.nDaysAgoOne'],
    ['2026-03-13', 'two days back', 'hostTenants.nDaysAgo'],
  ])('shows %s (%s) as %s', async (leaveDate, _label, key) => {
    expect(dayKeys(await confirmationText(leaveDate))).toEqual([key]);
  });
});
