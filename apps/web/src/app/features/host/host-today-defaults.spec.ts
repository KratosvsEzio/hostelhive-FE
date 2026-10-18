import { Type, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import { NEVER, Observable, Subject, of } from 'rxjs';
import {
  DocumentsApi,
  HostOpsApi,
  HostPropertyStore,
  HostelsApi,
  ImageUploadService,
  OverviewApi,
  StaffApi,
} from '@services';
import { NotificationService } from '@core/notification.service';
import { API_CONFIG } from '@core/api-config';
import { provideI18nTesting } from '@core/i18n/provide-i18n-testing';
import { DateRange } from '@layout/components/date-range-picker/date-range-picker';
import { ExpensesList } from './expenses/expenses-list';
import { InvoiceFormDrawer } from './invoices/invoice-form-drawer/invoice-form-drawer';
import { StaffFormDrawer } from './team/staff-form-drawer/staff-form-drawer';
import { AddBill } from './utilities/add-bill/add-bill';
import { Utilities } from './utilities/utilities';
import { AddGrocery } from './mess/add-grocery';
import { MessConfirmations } from './mess/mess-confirmations';
import { MessNotifications } from './mess/mess-notifications';
import { MovementDetail } from './overview/movement-detail/movement-detail';
import { OccupancyDetail } from './overview/occupancy-detail/occupancy-detail';
import { RevenueDetail } from './overview/revenue-detail/revenue-detail';

/**
 * Every console default and filter that means "today" takes the hostel's date (Trello #190).
 *
 * The clock is frozen at noon UTC on 31 March 2026, when a hostel in EAST is already on
 * 1 April and one in WEST is still on 31 March — a day and a month apart, so each pair of
 * expectations below differs on any device and the old device-date code fails one of them.
 */
const EAST = 'Pacific/Kiritimati'; // UTC+14
const WEST = 'Pacific/Pago_Pago'; // UTC-11
const NOON_UTC = Date.UTC(2026, 2, 31, 12, 0, 0);
const DAY = { [EAST]: '2026-04-01', [WEST]: '2026-03-31' } as const;

afterEach(() => vi.useRealTimers());

/** Every API answers nothing, and records what it was asked. */
function apiStub(calls: [string, unknown[]][]): unknown {
  return new Proxy(
    {},
    {
      get: (_t, key) =>
        key === 'then'
          ? undefined
          : (...args: unknown[]) => {
              calls.push([String(key), args]);
              return NEVER;
            },
    },
  );
}

interface Opened<T> {
  cmp: T;
  calls: [string, unknown[]][];
  settle: () => Promise<void>;
}

/**
 * The screen opened at the frozen instant for a hostel in `zone`, without its template.
 *
 * `zone` may be a Subject, to hold the zone read open.
 */
async function open<T>(
  type: Type<unknown>,
  zone: string | Subject<string | null>,
  opts: { inputs?: Record<string, unknown>; route?: object } = {},
): Promise<Opened<T>> {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(NOON_UTC);
  const calls: [string, unknown[]][] = [];
  const api = apiStub(calls);
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    providers: [
      provideRouter([]),
      provideI18nTesting(),
      {
        provide: HostPropertyStore,
        useValue: {
          selected: signal('hX'),
          properties: signal([{ id: 'hX' }]),
          hostels: signal([]),
          activeProperty: signal(undefined),
          activeHostel: signal(undefined),
          timeZoneOf: (): Observable<string | null> => (typeof zone === 'string' ? of(zone) : zone),
        },
      },
      ...[HostelsApi, HostOpsApi, OverviewApi, DocumentsApi, StaffApi, ImageUploadService].map(
        (token) => ({ provide: token, useValue: api }),
      ),
      { provide: NotificationService, useValue: { error: () => 0, success: () => 0 } },
      { provide: API_CONFIG, useValue: { baseUrl: 'http://api.test' } },
      {
        provide: ActivatedRoute,
        useValue: opts.route ?? {
          snapshot: { paramMap: convertToParamMap({}), queryParams: {}, data: {}, parent: null },
          queryParamMap: of(convertToParamMap({})),
        },
      },
    ],
  });
  TestBed.overrideComponent(type, { set: { template: '', imports: [] } });
  const fixture = TestBed.createComponent(type);
  for (const [k, v] of Object.entries(opts.inputs ?? {})) fixture.componentRef.setInput(k, v);
  const settle = async () => {
    fixture.detectChanges();
    await fixture.whenStable();
    TestBed.tick();
    fixture.detectChanges();
  };
  await settle();
  return { cmp: fixture.componentInstance as T, calls, settle };
}

const bothZones = [EAST, WEST] as const;

describe.each(bothZones)('host screens take "today" from the hostel (%s)', (zone) => {
  const today = DAY[zone];

  it('expenses: the date filter ends on, and rings, the hostel’s today', async () => {
    const { cmp } = await open<{ today(): string }>(ExpensesList, zone);
    expect(cmp.today()).toBe(today);
  });

  it('invoice form: a new invoice is issued on the hostel’s today', async () => {
    const { cmp } = await open<{ form(): { issuedDate: string } }>(InvoiceFormDrawer, zone);
    expect(cmp.form().issuedDate).toBe(today);
  });

  it('staff form: a new staff member joins on the hostel’s today', async () => {
    const { cmp } = await open<{ form(): { joiningDate: string } }>(StaffFormDrawer, zone, {
      inputs: { hostelId: 'hX' },
    });
    expect(cmp.form().joiningDate).toBe(today);
  });

  it('add bill: due five days after the hostel’s today, for the hostel’s month', async () => {
    const { cmp } = await open<{
      dueDateInput(): string | null;
      selectedMonthValue(): string;
      monthOptions(): { value: string; label: string }[];
    }>(AddBill, zone);
    expect(cmp.dueDateInput()).toBe(zone === EAST ? '2026-04-06' : '2026-04-05');
    const month = zone === EAST ? '2026-3' : '2026-2';
    expect(cmp.selectedMonthValue()).toBe(month);
    expect(cmp.monthOptions()[0].value).toBe(month);
  });

  it('utilities: the summary cards name the hostel’s month', async () => {
    const { cmp } = await open<{ currentMonthLabel(): string }>(Utilities, zone);
    expect(cmp.currentMonthLabel()).toBe(zone === EAST ? 'April 2026' : 'March 2026');
  });

  it('mess grocery: bought on the hostel’s today, and no later', async () => {
    const { cmp } = await open<{ date(): string | null; today(): string }>(AddGrocery, zone);
    expect(cmp.date()).toBe(today);
    expect(cmp.today()).toBe(today);
  });

  it('mess confirmations: today’s list is the hostel’s, fetched once', async () => {
    const { cmp, calls } = await open<{ selectedDate(): string | null; isToday(): boolean }>(
      MessConfirmations,
      zone,
    );
    expect(cmp.selectedDate()).toBe(today);
    expect(cmp.isToday()).toBe(true);
    const fetched = calls.filter(([name]) => name === 'mealConfirmations');
    expect(fetched.map(([, args]) => (args[1] as { date: string }).date)).toEqual([today]);
  });

  it('mess menu: today’s menu is the hostel’s weekday', async () => {
    const { cmp } = await open<{ todayIndex(): number; selectedDay(): number }>(MessNotifications, zone);
    // 1 April 2026 is a Wednesday, 31 March a Tuesday; Monday is 0.
    const weekday = zone === EAST ? 2 : 1;
    expect(cmp.todayIndex()).toBe(weekday);
    expect(cmp.selectedDay()).toBe(weekday);
  });

  it.each([
    ['movement', MovementDetail, 'tenantMovement'],
    ['occupancy', OccupancyDetail, 'occupancySummaries'],
    ['revenue', RevenueDetail, 'monthlyRevenue'],
  ] as const)(
    'overview %s: the last 12 months end on the hostel’s today, fetched once',
    async (_name, type, method) => {
      const { cmp, calls } = await open<{ dateRange(): DateRange | null; today(): string }>(type, zone);
      expect(cmp.today()).toBe(today);
      const from = zone === EAST ? '2025-04-02' : '2025-04-01';
      const fetched = calls.filter(([name]) => name === method).map(([, args]) => args.slice(1));
      expect(fetched).toEqual([[from, today]]);
    },
  );
});

describe('a default the host already changed is kept when the zone lands late', () => {
  it('invoice form', async () => {
    const zone = new Subject<string | null>();
    const { cmp, settle } = await open<{
      form(): { issuedDate: string };
      patch(key: 'issuedDate', value: string): void;
    }>(InvoiceFormDrawer, zone);
    cmp.patch('issuedDate', '2026-03-20');
    zone.next(EAST);
    await settle();
    expect(cmp.form().issuedDate).toBe('2026-03-20');
  });

  it('overview detail: nothing is fetched until the zone is known', async () => {
    const zone = new Subject<string | null>();
    const { calls, settle } = await open(RevenueDetail, zone);
    expect(calls.filter(([name]) => name === 'monthlyRevenue')).toEqual([]);
    zone.next(WEST);
    await settle();
    expect(calls.filter(([name]) => name === 'monthlyRevenue').map(([, a]) => a.slice(1))).toEqual([
      ['2025-04-01', '2026-03-31'],
    ]);
  });
});
