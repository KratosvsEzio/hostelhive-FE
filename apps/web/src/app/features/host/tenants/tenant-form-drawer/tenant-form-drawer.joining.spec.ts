import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Observable, Subject, of } from 'rxjs';
import { vi } from 'vitest';
import { NotificationService } from '@core/notification.service';
import { HostOpsApi, HostPropertyStore, ImageUploadService } from '@services';
import { HostBookingsApi } from '@features/host/bookings/host-bookings-api';
import { HOSTEL_ID } from '@app/testing/host-builders';
import { HostBookingsApiStub, HostOpsApiStub } from '@app/testing/host-stubs';
import { CheckInForm, emptyCheckInForm } from './tenant-form.model';
import { TenantFormDrawer } from './tenant-form-drawer';

/** 2026-03-15 12:37Z: 02:37 on the 16th at Kiritimati, 01:37 on the 15th at Pago Pago. */
const AT = Date.UTC(2026, 2, 15, 12, 37, 20);
const EAST = 'Pacific/Kiritimati';
const WEST = 'Pacific/Pago_Pago';

/** The drawer's own state, which the template reads; reached here without rendering it. */
interface Drawer {
  form: { (): CheckInForm | null; set(f: CheckInForm): void };
}

interface OpenOptions {
  zone?: string | null;
  zone$?: Observable<string | null>;
  mode?: 'create' | 'edit';
}

function setUp(opts: OpenOptions = {}) {
  const timeZoneOf = vi.fn<(hostelId: string) => Observable<string | null>>(
    () => opts.zone$ ?? of(opts.zone ?? null),
  );
  const store = {
    selected: signal(HOSTEL_ID),
    isMonthlyBilled: () => true,
    timeZoneOf,
  };

  TestBed.configureTestingModule({
    providers: [
      { provide: HostOpsApi, useValue: new HostOpsApiStub() },
      { provide: HostBookingsApi, useValue: new HostBookingsApiStub() },
      { provide: HostPropertyStore, useValue: store },
      { provide: ImageUploadService, useValue: {} },
      { provide: NotificationService, useValue: {} },
    ],
  });
  TestBed.overrideComponent(TenantFormDrawer, { set: { template: '', imports: [] } });
  const fixture = TestBed.createComponent(TenantFormDrawer);
  fixture.componentRef.setInput('mode', opts.mode ?? 'create');
  fixture.detectChanges();
  const drawer = fixture.componentInstance as unknown as Drawer;

  const settle = async (): Promise<void> => {
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
  };

  const edit = async (patch: Partial<CheckInForm>): Promise<void> => {
    drawer.form.set({ ...(drawer.form() ?? emptyCheckInForm()), ...patch });
    await settle();
  };
  return { timeZoneOf, drawer, settle, edit };
}

/** What the device's own clock reads at `at`, to the minute. */
function deviceWallClock(at: number): string {
  const d = new Date(at);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(AT);
});

afterEach(() => vi.useRealTimers());

describe('TenantFormDrawer joining default follows the hostel clock', () => {
  // The two zones are a calendar day apart at the same instant, so no device clock matches both.
  it('defaults to the date and time at the hostel, east and west of the device', async () => {
    const east = setUp({ zone: EAST });
    await east.settle();
    expect(east.drawer.form()?.joiningDate).toBe('2026-03-16T02:37');
    TestBed.resetTestingModule();

    const west = setUp({ zone: WEST });
    await west.settle();
    expect(west.drawer.form()?.joiningDate).toBe('2026-03-15T01:37');
  });

  it('starts on the device clock while the zone is pending, then moves when it lands', async () => {
    const zone$ = new Subject<string | null>();
    const { drawer, settle } = setUp({ zone$ });
    await settle();
    expect(drawer.form()?.joiningDate).toBe(deviceWallClock(AT));

    zone$.next(EAST);
    await settle();

    expect(drawer.form()?.joiningDate).toBe('2026-03-16T02:37');
  });

  it('keeps the time the clock read when the drawer opened, not when the zone landed', async () => {
    const zone$ = new Subject<string | null>();
    const { drawer, settle } = setUp({ zone$ });
    await settle();

    vi.setSystemTime(AT + 5 * 60_000);
    zone$.next(WEST);
    await settle();

    expect(drawer.form()?.joiningDate).toBe('2026-03-15T01:37');
  });

  it('never moves a joining date the host already changed', async () => {
    const zone$ = new Subject<string | null>();
    const { drawer, settle, edit } = setUp({ zone$ });
    await settle();
    await edit({ joiningDate: '2026-03-10T09:00' });

    zone$.next(EAST);
    await settle();

    expect(drawer.form()?.joiningDate).toBe('2026-03-10T09:00');
  });

  it('stays on the device clock when the hostel has no zone', async () => {
    const { drawer, settle } = setUp({ zone: null });
    await settle();

    expect(drawer.form()?.joiningDate).toBe(deviceWallClock(AT));
  });

  it('asks for no zone and moves nothing when editing an existing tenant', async () => {
    const { timeZoneOf, drawer, edit, settle } = setUp({ zone: EAST, mode: 'edit' });
    await edit({ id: 'tn-1', joiningDate: '2026-01-05T10:15' });
    await settle();

    expect(timeZoneOf).not.toHaveBeenCalled();
    expect(drawer.form()?.joiningDate).toBe('2026-01-05T10:15');
  });
});
