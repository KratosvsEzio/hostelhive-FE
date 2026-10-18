import { LOCALE_ID } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { AdminUtcDate } from './admin-utc-date';

describe('AdminUtcDate', () => {
  let pipe: AdminUtcDate;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [{ provide: LOCALE_ID, useValue: 'en-US' }],
    });
    pipe = TestBed.runInInjectionContext(() => new AdminUtcDate());
  });

  it('converts a timestamp sent with the server offset to UTC', () => {
    expect(
      pipe.transform('2028-03-27T10:00:00.000+05:00', 'd MMM yyyy, HH:mm'),
    ).toBe('27 Mar 2028, 05:00');
  });

  it('moves to the previous UTC day when the offset time is before 05:00', () => {
    expect(
      pipe.transform('2028-03-27T02:30:00.000+05:00', 'd MMM yyyy, HH:mm'),
    ).toBe('26 Mar 2028, 21:30');
  });

  it('leaves a Z timestamp as it is', () => {
    expect(pipe.transform('2026-10-11T14:05:00Z', 'd MMM yyyy, HH:mm')).toBe(
      '11 Oct 2026, 14:05',
    );
  });

  it('keeps a bare calendar date on the day it names', () => {
    expect(pipe.transform('2026-09-01', 'd MMM yyyy')).toBe('1 Sep 2026');
  });

  it('renders nothing for a missing or unparseable value', () => {
    expect(pipe.transform(null)).toBe('');
    expect(pipe.transform('')).toBe('');
    expect(pipe.transform('not a date')).toBe('');
  });
});
