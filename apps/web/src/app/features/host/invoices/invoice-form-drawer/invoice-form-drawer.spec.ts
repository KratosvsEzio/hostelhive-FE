import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { of, throwError } from 'rxjs';
import { ApiError, Invoice } from '@hostelhive/data-access';
import { HOSTEL_ID, invoice, sessionUser } from '@app/testing/host-builders';
import { CANCAN_MESSAGE, RefusalKind, refusalError } from '@app/testing/backend-refusals';
import { HostShellApiStub, NotificationSpy, seedHostPropertyStore } from '@app/testing/host-stubs';
import type { Role } from '@core/auth/roles';
import { SessionStore } from '@core/auth/session-store';
import { API_CONFIG } from '@core/api-config';
import { provideI18nTesting } from '@core/i18n/provide-i18n-testing';
import { HostOpsApi, HostPropertyStore } from '@services';
import { InvoiceFormDrawer } from './invoice-form-drawer';

const QUIET = { suppressErrorToast: true };
const BILLS_URL = `https://api.test/api/host/hostels/${HOSTEL_ID}/renter_bills`;

/** The members of the drawer these specs reach into; protected in the class, so typed here. */
interface Internals {
  form: { set(value: unknown): void; (): Record<string, string> };
  saving(): boolean;
  save(): void;
}

const pinned = (title: string) => ({ kind: 'error', title, message: undefined, ttlMs: 0 });

describe('InvoiceFormDrawer save failures', () => {
  let notifications: NotificationSpy;
  let createInvoice: ReturnType<typeof vi.fn>;
  let updateInvoice: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    notifications = new NotificationSpy();
    createInvoice = vi.fn();
    updateInvoice = vi.fn();
    TestBed.configureTestingModule({
      imports: [InvoiceFormDrawer],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: API_CONFIG, useValue: { baseUrl: 'https://api.test' } },
        provideI18nTesting(),
        notifications.provider(),
        new HostShellApiStub().provider(),
        { provide: HostOpsApi, useValue: { createInvoice, updateInvoice, renters: vi.fn(() => of({ renters: [], total: 0 })) } },
      ],
    }).overrideComponent(InvoiceFormDrawer, { set: { template: '', imports: [] } });
  });

  // A signed-in host persists its hostel choice; the session persists itself. Neither may reach the next test.
  afterEach(() => {
    TestBed.inject(HostPropertyStore).clear();
    TestBed.inject(SessionStore).clear();
  });

  /** Signs in as `role` before the store is seeded, because the store holds its hostel list for one user. */
  function open(role: Role | undefined, existing?: Invoice): Internals {
    if (role) TestBed.inject(SessionStore).setSession(sessionUser(role), 'tok');
    seedHostPropertyStore('month');
    const fixture = TestBed.createComponent(InvoiceFormDrawer);
    if (existing) fixture.componentRef.setInput('invoice', existing);
    fixture.detectChanges();
    const drawer = fixture.componentInstance as unknown as Internals & { saved: { emit: (v: unknown) => void } };
    const emitted = vi.spyOn(drawer.saved, 'emit');
    drawer.form.set({ ...drawer.form(), renterId: 't-1', renterName: 'Saad Ali', rent: '15000' });
    (drawer as unknown as { emitted: unknown }).emitted = emitted;
    return drawer;
  }

  const emittedOf = (drawer: Internals): ReturnType<typeof vi.fn> => (drawer as unknown as { emitted: ReturnType<typeof vi.fn> }).emitted;

  const permissionCases = [
    { role: 'manager', key: 'hostBookings.notAllowed' },
    { role: 'host', key: 'hostBookings.notAllowedOwner' },
  ] as const satisfies readonly { role: Role; key: string }[];

  describe('creating', () => {
    it.each(permissionCases)('tells a $role account once that it lacks permission and leaves the drawer unsaved', ({ role, key }) => {
      createInvoice.mockReturnValue(throwError(() => refusalError('permissionCanCan', { method: 'POST', url: BILLS_URL })));
      const drawer = open(role);

      drawer.save();

      expect(createInvoice).toHaveBeenCalledWith(HOSTEL_ID, expect.anything(), QUIET);
      expect(notifications.raised).toEqual([pinned(key)]);
      expect(notifications.raised[0].title).not.toContain(CANCAN_MESSAGE);
      expect(notifications.apiErrors).toEqual([]);
      expect(drawer.saving()).toBe(false);
      expect(emittedOf(drawer)).not.toHaveBeenCalled();
    });

    it('hands a validation refusal to the app-wide notifier once and raises no toast of its own', () => {
      const failure = refusalError('unprocessable', { method: 'POST', url: BILLS_URL });
      createInvoice.mockReturnValue(throwError(() => failure));
      const drawer = open(undefined);

      drawer.save();

      expect(notifications.apiErrors).toEqual([failure]);
      expect(notifications.raised).toEqual([]);
      expect(drawer.saving()).toBe(false);
      expect(emittedOf(drawer)).not.toHaveBeenCalled();
    });
  });

  describe('updating', () => {
    it.each<RefusalKind>(['crmRequired', 'crmMessageOnly'])('says the plan has no CRM after a %s refusal, quietly', (kind) => {
      updateInvoice.mockReturnValue(throwError(() => refusalError(kind, { method: 'PUT', url: `${BILLS_URL}/rb-2` })));
      const drawer = open('manager', invoice());

      drawer.save();

      expect(updateInvoice).toHaveBeenCalledWith(HOSTEL_ID, 'rb-2', expect.anything(), QUIET);
      expect(createInvoice).not.toHaveBeenCalled();
      expect(notifications.raised).toEqual([pinned('hostBookings.planHasNoCrm')]);
      expect(notifications.apiErrors).toEqual([]);
      expect(drawer.saving()).toBe(false);
      expect(emittedOf(drawer)).not.toHaveBeenCalled();
    });

    it('hands a failure that is not a refusal to the app-wide notifier once', () => {
      const failure: ApiError = refusalError('serverError', { method: 'PUT', url: `${BILLS_URL}/rb-2` });
      updateInvoice.mockReturnValue(throwError(() => failure));
      const drawer = open(undefined, invoice());

      drawer.save();

      expect(notifications.apiErrors).toEqual([failure]);
      expect(notifications.raised).toEqual([]);
    });
  });
});
