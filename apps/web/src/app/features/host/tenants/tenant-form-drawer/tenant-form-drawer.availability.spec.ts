import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Observable, of, throwError } from 'rxjs';
import { vi } from 'vitest';
import { NotificationService } from '@core/notification.service';
import { HostOpsApi, HostPropertyStore, ImageUploadService } from '@services';
import { HostBookingsApi } from '@features/host/bookings/host-bookings-api';
import { HOSTEL_ID, apiError, hostBooking, room, roomShow } from '@app/testing/host-builders';
import { HostBookingsApiStub, HostOpsApiStub } from '@app/testing/host-stubs';
import { AvailabilityVerdict } from '../room-availability';
import { CheckInForm, emptyCheckInForm } from './tenant-form.model';
import { TenantFormDrawer } from './tenant-form-drawer';

const ROOM_ID = 'r-101';
/** 2026-03-15 12:00Z: already the 16th at Kiritimati, still the 15th at Pago Pago. */
const INSTANT = Date.UTC(2026, 2, 15, 12, 0);
const EAST = 'Pacific/Kiritimati';
const WEST = 'Pacific/Pago_Pago';

/** The drawer's own state, which the template reads; reached here without rendering it. */
interface Drawer {
  form: { set(f: CheckInForm): void };
  availability(): { loading: boolean; verdict: AvailabilityVerdict | null };
}

interface OpenOptions {
  zone?: string | null;
  monthly?: boolean;
  capacity?: number;
}

/** A stay that checked out early: booked 10th to 20th March, one guest. */
const checkedOut = hostBooking('checked-out', {
  id: 'bk-out',
  checkIn: '2026-03-10',
  checkOut: '2026-03-20',
  guests: 1,
  occupancies: [],
});

function setUp(opts: OpenOptions = {}) {
  const ops = new HostOpsApiStub();
  const bookings = new HostBookingsApiStub();
  ops.roomShow.mockReturnValue(of(roomShow({ room: room({ id: ROOM_ID, capacity: opts.capacity ?? 1 }) })));
  bookings.bookingsInRoom.mockReturnValue(of([checkedOut]));
  const timeZoneOf = vi.fn<(hostelId: string) => Observable<string | null>>(() => of(opts.zone ?? null));
  const store = { selected: signal(HOSTEL_ID), isMonthlyBilled: () => !!opts.monthly, timeZoneOf };

  TestBed.configureTestingModule({
    providers: [
      { provide: HostOpsApi, useValue: ops },
      { provide: HostBookingsApi, useValue: bookings },
      { provide: HostPropertyStore, useValue: store },
      { provide: ImageUploadService, useValue: {} },
      { provide: NotificationService, useValue: {} },
    ],
  });
  TestBed.overrideComponent(TenantFormDrawer, { set: { template: '', imports: [] } });
  const fixture = TestBed.createComponent(TenantFormDrawer);
  fixture.componentRef.setInput('mode', 'create');
  fixture.detectChanges();
  const drawer = fixture.componentInstance as unknown as Drawer;

  /** Fills in the room and a joining date of 15 March with no leave date, then lets the lookup run. */
  const askForRoom = async (): Promise<AvailabilityVerdict | null> => {
    drawer.form.set({ ...emptyCheckInForm(ROOM_ID), joiningDate: '2026-03-15', leaveDate: '' });
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    return drawer.availability().verdict;
  };
  return { ops, bookings, timeZoneOf, drawer, askForRoom };
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(INSTANT);
});

afterEach(() => vi.useRealTimers());

describe('TenantFormDrawer availability follows the hostel date', () => {
  it('refuses the bed east of the device zone, where the checked-out stay still held last night', async () => {
    const { askForRoom, timeZoneOf } = setUp({ zone: EAST });

    const verdict = await askForRoom();

    expect(timeZoneOf).toHaveBeenCalledWith(HOSTEL_ID);
    expect(verdict?.ok).toBe(false);
    expect(verdict?.firstBlocked).toBe('2026-03-15');
  });

  it('accepts the same bed west of the device zone, where the stay was released today', async () => {
    const { askForRoom } = setUp({ zone: WEST });

    const verdict = await askForRoom();

    expect(verdict?.ok).toBe(true);
    expect(verdict?.blockedNights).toBe(0);
  });
});

describe('TenantFormDrawer availability when the lookup cannot be trusted', () => {
  it('fails open with no verdict when the room read errors', async () => {
    const { ops, askForRoom, drawer } = setUp({ zone: EAST });
    ops.roomShow.mockReturnValue(throwError(() => apiError(500, [], 'GET')));

    const verdict = await askForRoom();

    expect(verdict).toBeNull();
    expect(drawer.availability().loading).toBe(false);
  });

  it('falls back to the device date when the hostel has no zone', async () => {
    const { askForRoom } = setUp({ zone: null });
    const device = new Date(INSTANT);
    const pad = (n: number) => String(n).padStart(2, '0');
    const deviceToday = `${device.getFullYear()}-${pad(device.getMonth() + 1)}-${pad(device.getDate())}`;

    const verdict = await askForRoom();

    // The stay holds the night of the 15th exactly when the device's today is after it.
    expect(verdict?.ok).toBe(deviceToday <= '2026-03-15');
  });
});

describe('TenantFormDrawer availability on a month-billed hostel', () => {
  it('asks for neither the zone, the room nor its bookings', async () => {
    const { ops, bookings, timeZoneOf, askForRoom } = setUp({ monthly: true });

    await askForRoom();

    expect(timeZoneOf).not.toHaveBeenCalled();
    expect(ops.roomShow).not.toHaveBeenCalled();
    expect(bookings.bookingsInRoom).not.toHaveBeenCalled();
  });
});
