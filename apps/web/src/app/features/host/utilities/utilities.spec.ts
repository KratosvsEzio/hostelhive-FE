import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, provideRouter } from '@angular/router';
import { of, Subject, throwError } from 'rxjs';
import { HostOpsApi, HostPropertyStore } from '@services';
import { UtilityBill } from '@hostelhive/data-access';
import { API_CONFIG } from '@core/api-config';
import { Utilities } from './utilities';

type Aggs = { billToPay: number; received: number; balance: number };
type Status = { name: string; slug: string; count: number };

interface UtilitiesShape {
  aggs: () => Aggs | null;
  statuses: () => Status[];
  bills: () => UtilityBill[];
  state: () => { loading: boolean };
  promptDelete(b: UtilityBill, event: MouseEvent): void;
  confirmDelete(): void;
}

const BILL_A = { id: 'GPfbpD', totalAmount: 990 } as unknown as UtilityBill;
const BILL_B = { id: 'bCGPAU', totalAmount: 65 } as unknown as UtilityBill;

function listResponse(balance: number, dueCount: number) {
  return {
    bills: [BILL_A, BILL_B],
    total: 2,
    statuses: [{ name: 'Due', slug: 'due', count: dueCount }],
    aggs: { billToPay: 0, received: 0, balance },
  };
}

const click = { stopPropagation: () => undefined } as unknown as MouseEvent;

function setup(deleteResult: () => ReturnType<HostOpsApi['deleteUtilityBill']>) {
  const utilityBills = vi.fn().mockReturnValueOnce(of(listResponse(1055, 2)));
  const deleteUtilityBill = vi.fn(deleteResult);
  TestBed.configureTestingModule({
    providers: [
      provideRouter([]),
      { provide: HostOpsApi, useValue: { utilityBills, deleteUtilityBill } },
      { provide: HostPropertyStore, useValue: { selected: signal('zppsla') } },
      { provide: ActivatedRoute, useValue: { snapshot: { queryParams: {} } } },
      { provide: API_CONFIG, useValue: { baseUrl: 'http://api.test' } },
    ],
  });
  TestBed.overrideComponent(Utilities, { set: { template: '', imports: [] } });
  const fixture = TestBed.createComponent(Utilities);
  fixture.detectChanges();
  return { cmp: fixture.componentInstance as unknown as UtilitiesShape, fixture, utilityBills, deleteUtilityBill };
}

describe('Utilities — delete refreshes the summary cards', () => {
  it('re-reads the totals and status counts after a successful delete, without reloading the table', () => {
    const { cmp, fixture, utilityBills, deleteUtilityBill } = setup(() => of(undefined));
    expect(cmp.aggs()?.balance).toBe(1055);

    utilityBills.mockReturnValueOnce(of({ ...listResponse(65, 1), bills: [BILL_B], total: 1 }));
    cmp.promptDelete(BILL_A, click);
    cmp.confirmDelete();
    fixture.detectChanges();

    expect(deleteUtilityBill).toHaveBeenCalledWith('zppsla', 'GPfbpD');
    expect(utilityBills).toHaveBeenCalledTimes(2);
    expect(utilityBills.mock.calls[1]).toEqual(utilityBills.mock.calls[0]);
    expect(cmp.aggs()?.balance).toBe(65);
    expect(cmp.statuses()).toEqual([{ name: 'Due', slug: 'due', count: 1 }]);
    expect(cmp.bills().map((b) => b.id)).toEqual(['bCGPAU']);
    expect(cmp.state().loading).toBe(false);
  });

  it('does not re-read the totals while the delete is still in flight', () => {
    const pending = new Subject<void>();
    const { cmp, utilityBills } = setup(() => pending.asObservable() as never);

    cmp.promptDelete(BILL_A, click);
    cmp.confirmDelete();

    expect(utilityBills).toHaveBeenCalledTimes(1);
    expect(cmp.bills().map((b) => b.id)).toEqual(['bCGPAU']);
  });

  it('keeps the old totals and restores the row when the delete fails', () => {
    const { cmp, utilityBills } = setup(() => throwError(() => new Error('500')));

    cmp.promptDelete(BILL_A, click);
    cmp.confirmDelete();

    expect(utilityBills).toHaveBeenCalledTimes(1);
    expect(cmp.aggs()?.balance).toBe(1055);
    expect(cmp.bills().map((b) => b.id)).toEqual(['GPfbpD', 'bCGPAU']);
  });

  it('keeps the old totals when the follow-up read fails', () => {
    const { cmp, utilityBills } = setup(() => of(undefined));
    utilityBills.mockReturnValueOnce(throwError(() => new Error('network')));

    cmp.promptDelete(BILL_A, click);
    cmp.confirmDelete();

    expect(utilityBills).toHaveBeenCalledTimes(2);
    expect(cmp.aggs()?.balance).toBe(1055);
    expect(cmp.bills().map((b) => b.id)).toEqual(['bCGPAU']);
  });
});
