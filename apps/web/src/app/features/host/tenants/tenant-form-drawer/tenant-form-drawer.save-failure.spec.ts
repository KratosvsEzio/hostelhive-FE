import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Observable, of, throwError } from 'rxjs';
import { vi } from 'vitest';
import { Tenant } from '@hostelhive/data-access';
import { SessionStore } from '@core/auth/session-store';
import { provideI18nTesting } from '@core/i18n/provide-i18n-testing';
import { HostOpsApi, HostPropertyStore, ImageUploadService } from '@services';
import { HostBookingsApi } from '@features/host/bookings/host-bookings-api';
import { RefusalKind, refusalError } from '@app/testing/backend-refusals';
import { HOSTEL_ID, sessionUser } from '@app/testing/host-builders';
import { HostBookingsApiStub, HostOpsApiStub, NotificationSpy } from '@app/testing/host-stubs';
import { CheckInForm, emptyCheckInForm } from './tenant-form.model';
import { TenantFormDrawer } from './tenant-form-drawer';

/** The drawer's own state and save, which the template drives; reached here without rendering it. */
interface Drawer {
  form: { (): CheckInForm | null; set(f: CheckInForm): void };
  saving(): boolean;
  save(): void;
}

const QUIET = { suppressErrorToast: true };

/** Every field the form requires for a monthly hostel, so `save()` goes to the server. */
const FILLED: Partial<CheckInForm> = {
  fullName: 'Ali Khan',
  email: 'ali@example.com',
  phone: '03001234567',
  cnicNumber: '35202-1234567-1',
  address: '12 Canal Road',
  joiningDate: '2026-03-15',
  rent: '15000',
  advanceDeposit: '15000',
  billingDate: '1',
  billingDueDate: '5',
};

/** A drawer with the renter writes stubbed; `form.id` set means an edit, absent means a create. */
async function openDrawer(
  reply: Observable<Tenant>,
  opts: { editing?: boolean; role?: 'host' | 'manager' } = {},
) {
  const ops = Object.assign(new HostOpsApiStub(), {
    createRenter: vi.fn<HostOpsApi['createRenter']>(() => reply),
    updateRenter: vi.fn<HostOpsApi['updateRenter']>(() => reply),
  });
  const notifications = new NotificationSpy();
  TestBed.configureTestingModule({
    providers: [
      provideI18nTesting(),
      ops.provider(),
      { provide: HostBookingsApi, useValue: new HostBookingsApiStub() },
      { provide: HostPropertyStore, useValue: { selected: signal(HOSTEL_ID), isMonthlyBilled: () => true, timeZoneOf: () => of(null) } },
      { provide: ImageUploadService, useValue: {} },
      notifications.provider(),
    ],
  });
  TestBed.overrideComponent(TenantFormDrawer, { set: { template: '', imports: [] } });
  TestBed.inject(SessionStore).setSession(sessionUser(opts.role ?? 'manager'), 'tok');
  const fixture = TestBed.createComponent(TenantFormDrawer);
  fixture.componentRef.setInput('mode', 'create');
  const saved = vi.fn();
  fixture.componentInstance.saved.subscribe(saved);
  fixture.detectChanges();
  const drawer = fixture.componentInstance as unknown as Drawer;
  drawer.form.set({
    ...emptyCheckInForm(),
    ...FILLED,
    ...(opts.editing ? { id: 't-1' } : {}),
  });
  fixture.detectChanges();
  await fixture.whenStable();
  return { ops, notifications, drawer, saved };
}

afterEach(() => TestBed.inject(SessionStore).clear());

describe('Tenant drawer when a save is refused', () => {
  const PERMISSION: readonly RefusalKind[] = ['permissionCanCan', 'permissionRender403'];

  describe.each([
    ['owner', 'host'],
    ['staff', 'manager'],
  ] as const)('for the %s', (_who, role) => {
    const expected = role === 'host' ? 'hostBookings.notAllowedOwner' : 'hostBookings.notAllowed';

    it.each(PERMISSION)('creating on a %s refusal raises one pinned translated toast and saves nothing', async (kind) => {
      const { ops, notifications, drawer, saved } = await openDrawer(
        throwError(() => refusalError(kind, { method: 'POST' })),
        { role },
      );

      drawer.save();

      expect(ops.createRenter).toHaveBeenCalledWith(HOSTEL_ID, expect.anything(), QUIET);
      expect(notifications.raised).toEqual([{ kind: 'error', title: expected, ttlMs: 0 }]);
      expect(notifications.apiErrors).toEqual([]);
      expect(drawer.saving()).toBe(false);
      expect(saved).not.toHaveBeenCalled();
    });
  });

  it.each(['crmRequired', 'crmMessageOnly'] as const)(
    'updating on a %s refusal says the plan has no CRM, quietly, in one toast',
    async (kind) => {
      const { ops, notifications, drawer, saved } = await openDrawer(
        throwError(() => refusalError(kind, { method: 'PUT' })),
        { editing: true },
      );

      drawer.save();

      expect(ops.updateRenter).toHaveBeenCalledWith(HOSTEL_ID, 't-1', expect.anything(), QUIET);
      expect(ops.createRenter).not.toHaveBeenCalled();
      expect(notifications.raised).toEqual([{ kind: 'error', title: 'hostBookings.planHasNoCrm', ttlMs: 0 }]);
      expect(notifications.apiErrors).toEqual([]);
      expect(drawer.saving()).toBe(false);
      expect(saved).not.toHaveBeenCalled();
    },
  );

  it('hands a validation failure to the app notifier once and raises no second toast', async () => {
    const error = refusalError('unprocessable', { method: 'POST' });
    const { notifications, drawer, saved } = await openDrawer(throwError(() => error));

    drawer.save();

    expect(notifications.apiErrors).toEqual([error]);
    expect(notifications.raised).toEqual([]);
    expect(drawer.saving()).toBe(false);
    expect(saved).not.toHaveBeenCalled();
  });
});
