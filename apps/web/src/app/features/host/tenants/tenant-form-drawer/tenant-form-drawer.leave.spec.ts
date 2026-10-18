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

/** 2026-03-15 12:00Z: already the 16th at Kiritimati, still the 15th at Pago Pago. */
const I2 = Date.UTC(2026, 2, 15, 12, 0);
/** 2026-10-24 12:00Z: the day before London's clocks go back. */
const ID = Date.UTC(2026, 9, 24, 12, 0);
const EAST = 'Pacific/Kiritimati';
const WEST = 'Pacific/Pago_Pago';
const LONDON = 'Europe/London';

/** The drawer's own state, which the template reads; reached here without rendering it. */
interface Drawer {
  form: { (): CheckInForm | null; set(f: CheckInForm): void };
  leaveInfo(): { date: string; days: number } | null;
}

interface OpenOptions {
  zone?: string | null;
  zone$?: Observable<string | null>;
  monthly?: boolean;
  mode?: 'create' | 'edit';
}

function setUp(opts: OpenOptions = {}) {
  const timeZoneOf = vi.fn<(hostelId: string) => Observable<string | null>>(
    () => opts.zone$ ?? of(opts.zone ?? null),
  );
  const store = {
    selected: signal(HOSTEL_ID),
    isMonthlyBilled: () => !!opts.monthly,
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

  /** Replaces the form with a patch over the current one (or a blank one), then lets effects run. */
  const edit = async (patch: Partial<CheckInForm>): Promise<void> => {
    drawer.form.set({ ...(drawer.form() ?? emptyCheckInForm()), ...patch });
    await settle();
  };
  return { timeZoneOf, drawer, settle, edit };
}

function deviceToday(at: number): string {
  const d = new Date(at);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function daysBetween(from: string, to: string): number {
  const [fy, fm, fd] = from.split('-').map(Number);
  const [ty, tm, td] = to.split('-').map(Number);
  return Math.round((Date.UTC(ty, tm - 1, td) - Date.UTC(fy, fm - 1, fd)) / 86_400_000);
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(I2);
});

afterEach(() => vi.useRealTimers());

describe('TenantFormDrawer leave zone request', () => {
  it('asks for no zone while a new tenant has no leave date', async () => {
    const { timeZoneOf, edit } = setUp({ monthly: true });

    await edit({ fullName: 'Sana' });
    await edit({ phone: '0300 1234567' });

    expect(timeZoneOf).not.toHaveBeenCalled();
  });

  it('asks for the zone once when a leave date is entered and not again for other edits', async () => {
    const { timeZoneOf, edit } = setUp({ monthly: true, zone: EAST });

    await edit({ leaveDate: '2026-03-20' });
    expect(timeZoneOf).toHaveBeenCalledTimes(1);
    expect(timeZoneOf).toHaveBeenCalledWith(HOSTEL_ID);

    await edit({ fullName: 'Sana' });
    await edit({ leaveDate: '2026-03-25' });

    expect(timeZoneOf).toHaveBeenCalledTimes(1);
  });

  it('asks for no zone when editing an existing tenant with a leave date', async () => {
    const { timeZoneOf, edit } = setUp({ monthly: true, zone: EAST, mode: 'edit' });

    await edit({ id: 'tn-1', leaveDate: '2026-03-20' });

    expect(timeZoneOf).not.toHaveBeenCalled();
  });
});

describe('TenantFormDrawer leave countdown follows the hostel date', () => {
  it('counts 4 days east of the device zone and 5 days west of it', async () => {
    const east = setUp({ monthly: true, zone: EAST });
    await east.edit({ leaveDate: '2026-03-20' });
    expect(east.drawer.leaveInfo()?.days).toBe(4);
    TestBed.resetTestingModule();

    const west = setUp({ monthly: true, zone: WEST });
    await west.edit({ leaveDate: '2026-03-20' });
    expect(west.drawer.leaveInfo()?.days).toBe(5);
  });

  it('counts from the device date while the zone is pending, then recounts when it lands', async () => {
    const zone$ = new Subject<string | null>();
    const { drawer, edit, settle } = setUp({ monthly: true, zone$ });

    await edit({ leaveDate: '2026-03-20' });
    expect(drawer.leaveInfo()?.days).toBe(daysBetween(deviceToday(I2), '2026-03-20'));

    zone$.next(EAST);
    await settle();

    expect(drawer.leaveInfo()?.days).toBe(4);
  });

  it('counts the plain leave date as a hostel day west of UTC without dropping one', async () => {
    const { drawer, edit } = setUp({ monthly: true, zone: WEST });

    await edit({ leaveDate: '2026-03-20' });

    expect(drawer.leaveInfo()).toEqual({ date: '2026-03-20', days: 5 });
  });

  it('counts two days across the London clock change rather than three', async () => {
    vi.setSystemTime(ID);
    const { drawer, edit } = setUp({ monthly: true, zone: LONDON });

    await edit({ leaveDate: '2026-10-26' });

    expect(drawer.leaveInfo()?.days).toBe(2);
  });
});
