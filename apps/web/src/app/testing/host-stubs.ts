import { Provider, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { NEVER, Observable, of } from 'rxjs';
import { vi } from 'vitest';
import { ApiError, HostListingsData } from '@hostelhive/data-access';
import { NotificationService, Toast, ToastKind } from '@core/notification.service';
import { API_ERROR_NOTIFIER } from '@core/tokens';
import { HostOpsApi } from '@services/host-ops-api';
import { HostPropertyStore } from '@services/host-property-store';
import { HostShellApi } from '@services/host-shell-api';
import { HostBookingsApi } from '@features/host/bookings/host-bookings-api';
import {
  BillingMode,
  EMPTY_CALENDAR,
  HOSTEL_ID,
  bookingPage,
  hostListing,
  invoicesReply,
  roomShow,
  roomsReply,
} from './host-builders';

/**
 * `vi.fn` stand-ins for the `HostOpsApi` methods the host pages call.
 *
 * Reads that fill a page answer empty; single reads and writes answer `NEVER` (pending) until a
 * test sets them, so a forgotten reply shows as a stuck state rather than a fabricated success.
 */
export class HostOpsApiStub {
  invoices = vi.fn<HostOpsApi['invoices']>(() => of(invoicesReply()));
  invoice = vi.fn<HostOpsApi['invoice']>(() => NEVER);
  bookingInvoices = vi.fn<HostOpsApi['bookingInvoices']>(() => of(new Map()));
  markInvoicePaid = vi.fn<HostOpsApi['markInvoicePaid']>(() => NEVER);
  deleteInvoice = vi.fn<HostOpsApi['deleteInvoice']>(() => NEVER);
  rooms = vi.fn<HostOpsApi['rooms']>(() => of(roomsReply()));
  roomShow = vi.fn<HostOpsApi['roomShow']>(() => of(roomShow()));
  roomDetail = vi.fn<HostOpsApi['roomDetail']>(() => of([]));
  roomFormOptions = vi.fn<HostOpsApi['roomFormOptions']>(() => of([]));
  deleteRoom = vi.fn<HostOpsApi['deleteRoom']>(() => NEVER);
  createRoom = vi.fn<HostOpsApi['createRoom']>(() => NEVER);
  updateRoom = vi.fn<HostOpsApi['updateRoom']>(() => NEVER);
  bulkCreateRooms = vi.fn<HostOpsApi['bulkCreateRooms']>(() => NEVER);
  deleteRenter = vi.fn<HostOpsApi['deleteRenter']>(() => NEVER);

  provider(): Provider {
    return { provide: HostOpsApi, useValue: this };
  }
}

/**
 * `vi.fn` stand-ins for every `HostBookingsApi` method.
 *
 * Same defaults as {@link HostOpsApiStub}: the list, calendar and room reads answer empty; `get`,
 * the lifecycle moves, `generateInvoice` and `releaseOccupancy` answer `NEVER` until set.
 */
export class HostBookingsApiStub {
  list = vi.fn<HostBookingsApi['list']>(() => of(bookingPage()));
  calendar = vi.fn<HostBookingsApi['calendar']>(() => of(EMPTY_CALENDAR));
  bookingsOn = vi.fn<HostBookingsApi['bookingsOn']>(() => of([]));
  bookingsInRoom = vi.fn<HostBookingsApi['bookingsInRoom']>(() => of([]));
  occupancies = vi.fn<HostBookingsApi['occupancies']>(() => of([]));
  get = vi.fn<HostBookingsApi['get']>(() => NEVER);
  create = vi.fn<HostBookingsApi['create']>(() => NEVER);
  confirm = vi.fn<HostBookingsApi['confirm']>(() => NEVER);
  checkIn = vi.fn<HostBookingsApi['checkIn']>(() => NEVER);
  markPaid = vi.fn<HostBookingsApi['markPaid']>(() => NEVER);
  checkOut = vi.fn<HostBookingsApi['checkOut']>(() => NEVER);
  cancel = vi.fn<HostBookingsApi['cancel']>(() => NEVER);
  markNoShow = vi.fn<HostBookingsApi['markNoShow']>(() => NEVER);
  generateInvoice = vi.fn<HostBookingsApi['generateInvoice']>(() => NEVER);
  releaseOccupancy = vi.fn<HostBookingsApi['releaseOccupancy']>(() => NEVER);

  provider(): Provider {
    return { provide: HostBookingsApi, useValue: this };
  }
}

/** One notification as any of the four entry points raised it. */
export interface RaisedToast {
  kind: ToastKind;
  title: string;
  message?: string;
  /** The `ttlMs` passed to `show`; `undefined` for the shorthands and the default. 0 = sticky. */
  ttlMs?: number;
}

/**
 * A `NotificationService` whose entry points are `vi.fn`s, plus {@link raised}: every toast in the
 * order it was raised, whichever method raised it, so "exactly one toast" is one assertion.
 *
 * It also stands in for the app-wide error notifier (`API_ERROR_NOTIFIER`): {@link apiErrors} is
 * every failure handed to it, which a page does for a quiet request whose failure should read
 * exactly as the global toast would.
 */
export class NotificationSpy {
  readonly raised: RaisedToast[] = [];
  readonly toasts = signal<readonly Toast[]>([]);

  show = vi.fn((toast: Omit<Toast, 'id'>, ttlMs?: number): number =>
    this.push({ kind: toast.kind, title: toast.title, message: toast.message, ttlMs }),
  );
  error = vi.fn((title: string, message?: string): number => this.push({ kind: 'error', title, message }));
  info = vi.fn((title: string, message?: string): number => this.push({ kind: 'info', title, message }));
  success = vi.fn((title: string, message?: string): number => this.push({ kind: 'success', title, message }));
  dismiss = vi.fn<(id: number) => void>();
  muteErrors = vi.fn((): (() => void) => () => undefined);
  readonly apiErrors: ApiError[] = [];
  notifyApiError = vi.fn((error: ApiError): void => {
    this.apiErrors.push(error);
  });

  provider(): Provider {
    return [
      { provide: NotificationService, useValue: this },
      { provide: API_ERROR_NOTIFIER, useValue: this.notifyApiError },
    ];
  }

  private push(toast: RaisedToast): number {
    this.raised.push(toast);
    return this.raised.length;
  }
}

/**
 * `HostShellApi` answering with fixed listings; `HostPropertyStore` cannot be built without one.
 *
 * `hostelTimeZone` answers with {@link timeZone} — null (no zone, the device's clock) unless a
 * test sets it, so a page that waits on the zone still renders.
 */
export class HostShellApiStub {
  data: HostListingsData = { listings: [], draft: null, stats: {} as never };
  timeZone: string | null = null;
  listings(): Observable<HostListingsData> {
    return of(this.data);
  }
  hostelTimeZone = vi.fn<HostShellApi['hostelTimeZone']>(() => of(this.timeZone));
  provider(): Provider {
    return { provide: HostShellApi, useValue: this };
  }
}

/**
 * Puts one hostel with the given billing cycle into `HostPropertyStore` and selects it.
 *
 * `'night'` and `'month'` are the two known cycles; `''` is a hostel whose cycle did not arrive,
 * which the store treats as neither. Call after `TestBed.configureTestingModule` (with a
 * `HostShellApi` provided — {@link HostShellApiStub} or the page harness does it) and before
 * creating the component. Goes through the store's own `load()` with the shell API answering the
 * one listing, so the store ends up exactly as the app would leave it; with nobody signed in
 * nothing is written to `localStorage`.
 */
export function seedHostPropertyStore(billing: BillingMode, hostelId = HOSTEL_ID): HostPropertyStore {
  const store = TestBed.inject(HostPropertyStore);
  const listing = hostListing(billing, { id: hostelId });
  const data: HostListingsData = { listings: [listing], draft: null, stats: {} as never };
  vi.spyOn(TestBed.inject(HostShellApi), 'listings').mockReturnValue(of(data));
  store.load();
  store.setProperty(hostelId);
  return store;
}
