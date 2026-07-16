import { Injectable, inject } from '@angular/core';
import { EMPTY, Observable, map } from 'rxjs';
import { AnalyticsData, Kpi, RevenuePoint, TenantMovement } from '@hostelhive/data-access';
import { ApiClient } from '@core/api-resource';

interface RenterMovementResponse {
  aggs: { month: string; moved_in: number; moved_out: number }[];
  success?: boolean;
}

interface OccupancySummaryResponse {
  aggs: {
    id: number;
    vacant_capacity: number;
    occupied_capacity: number;
    hostel_id: string;
    total_capacity: number;
    occupancy_percentage: number;
    recorded_at: string;
  }[];
  success?: boolean;
}

export interface OccupancySummaryPoint {
  month: string;      // 'Jun'
  monthLabel: string; // 'Jun 2026'
  occupancyPct: number;
  occupiedBeds: number;
  vacantBeds: number;
  totalBeds: number;
}

interface MonthlyRevenueResponse {
  aggs: {
    month: string;
    rent: number;
    utility: number;
    tenants?: number;
  }[];
}

interface ApiOverviewCardsResponse {
  aggs: {
    room_aggs: {
      total_capacity: number;
      occupied_capacity: number;
      vacant_capacity: number;
      occupancy_rate: number;
    };
    renter_bill_aggs: {
      collected_this_month: { amount: number; vs_last_month: number };
      pending_total: { amount: number; vs_last_month: number; unpaid_renters: number };
      pending_rent: { amount: number; unpaid_renters: number };
      pending_utility: { amount: number; unpaid_renters: number };
    };
  };
  success?: boolean;
}

const SHORT_MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

function toKpis(res: ApiOverviewCardsResponse, month: string): Kpi[] {
  const room = res.aggs?.room_aggs;
  const bills = res.aggs?.renter_bill_aggs;
  if (!room || !bills) return [];

  return [
    {
      key: 'occupancy',
      label: 'Occupancy',
      value: `${room.occupancy_rate}%`,
      tone: 'brand',
      donut: room.occupancy_rate,
    },
    {
      key: 'vacant',
      label: 'Vacant beds',
      value: String(room.vacant_capacity),
      tone: 'neutral',
    },
    {
      key: 'collected',
      label: `Collected · ${month}`,
      value: '',
      rawValue: bills.collected_this_month.amount,
      prefix: 'Rs ',
      tone: 'ok',
      deltaPct: bills.collected_this_month.vs_last_month,
    },
    {
      key: 'pending-total',
      label: 'Pending total',
      value: '',
      rawValue: bills.pending_total.amount,
      prefix: 'Rs ',
      tone: 'warn',
      deltaPct: bills.pending_total.vs_last_month,
    },
    {
      key: 'pending-rent',
      label: 'Pending rent',
      value: '',
      rawValue: bills.pending_rent.amount,
      prefix: 'Rs ',
      tone: 'danger',
    },
    {
      key: 'pending-utility',
      label: 'Pending utility',
      value: '',
      rawValue: bills.pending_utility.amount,
      prefix: 'Rs ',
      tone: 'warn',
    },
  ];
}

@Injectable({ providedIn: 'root' })
export class AnalyticsApi {
  private readonly api = inject(ApiClient);

  getAnalytics(hostelSlug: string): Observable<AnalyticsData> {
    if (!hostelSlug) return EMPTY;

    const month = new Date().getMonth();

    return this.api
      .get<ApiOverviewCardsResponse>(
        `/api/host/hostels/${hostelSlug}/overview_cards`,
      )
      .pipe(
        map((res) => ({
          kpis: toKpis(res, SHORT_MONTHS[month]),
          revenue: [],
          occupancy: [],
          ledger: [],
        })),
      );
  }

  monthlyRevenue(slug: string, startDate?: string, endDate?: string): Observable<RevenuePoint[]> {
    const params: Record<string, string> = {};
    if (startDate) params['start_date'] = startDate;
    if (endDate) params['end_date'] = endDate;
    return this.api
      .get<MonthlyRevenueResponse>(
        `/api/host/hostels/${slug}/monthly_revenue`,
        Object.keys(params).length ? params : undefined,
      )
      .pipe(
        map((res) =>
          (res.aggs ?? []).map((a) => {
            const monthIndex = parseInt(a.month.split('-')[1], 10) - 1;
            return {
              month: SHORT_MONTHS[monthIndex] ?? a.month,
              rent: a.rent ?? 0,
              utility: a.utility ?? 0,
              tenants: a.tenants,
            };
          }),
        ),
      );
  }

  occupancySummaries(slug: string, startDate?: string, endDate?: string): Observable<OccupancySummaryPoint[]> {
    const params: Record<string, string> = {};
    if (startDate) params['start_date'] = startDate;
    if (endDate) params['end_date'] = endDate;
    return this.api
      .get<OccupancySummaryResponse>(
        `/api/host/hostels/${slug}/occupancy_summaries`,
        Object.keys(params).length ? params : undefined,
      )
      .pipe(
        map((res) =>
          (res.aggs ?? []).map((a) => {
            const d = new Date(a.recorded_at);
            return {
              month: SHORT_MONTHS[d.getMonth()],
              monthLabel: `${SHORT_MONTHS[d.getMonth()]} ${d.getFullYear()}`,
              occupancyPct: Math.round(a.occupancy_percentage),
              occupiedBeds: a.occupied_capacity,
              vacantBeds: a.vacant_capacity,
              totalBeds: a.total_capacity,
            };
          }),
        ),
      );
  }

  tenantMovement(slug: string, startDate?: string, endDate?: string): Observable<TenantMovement[]> {
    const params: Record<string, string> = {};
    if (startDate) params['start_date'] = startDate;
    if (endDate) params['end_date'] = endDate;
    return this.api
      .get<RenterMovementResponse>(
        `/api/host/hostels/${slug}/monthly_renter_movement`,
        Object.keys(params).length ? params : undefined,
      )
      .pipe(
        map((res) =>
          (res.aggs ?? []).map((a) => {
            const monthIndex = parseInt(a.month.split('-')[1], 10) - 1;
            return {
              month: SHORT_MONTHS[monthIndex] ?? a.month,
              rawMonth: a.month,
              movedIn: a.moved_in,
              movedOut: a.moved_out,
            };
          }),
        ),
      );
  }
}
