import { RoomDay } from '@features/host/rooms/room-calendar/room-stays';
import {
  OPEN_ENDED_HORIZON_DAYS,
  assessAvailability,
  shiftDay,
  stayWindow,
} from './room-availability';

function days(capacity: number, booked: Record<string, number>, from = 1, to = 10): RoomDay[] {
  const out: RoomDay[] = [];
  for (let d = from; d <= to; d++) {
    const date = `2026-09-${String(d).padStart(2, '0')}`;
    out.push({ date, booked: booked[date] ?? 0, capacity, booking_ids: [] });
  }
  return out;
}

/**
 * The check that stops a host putting two people in one bed.
 *
 * It runs before a save the host believes will succeed, so both ways of being wrong are
 * expensive: refuse a free room and they cannot check anybody in, allow a full one and the
 * clash surfaces later on a calendar nobody was looking at.
 */
describe('stayWindow', () => {
  /**
   * The leave date is exclusive, matching the bookings endpoint and the room calendar. Read
   * it as inclusive and a handover — one tenant out on the 5th, the next in the same day —
   * reads as a clash, which is the commonest booking there is.
   */
  it('asks for the nights slept in, not the morning they leave', () => {
    expect(stayWindow('2026-09-01', '2026-09-05')).toEqual({
      from: '2026-09-01',
      to: '2026-09-04',
      openEnded: false,
    });
  });

  it('still asks for the first night on a same-day stay', () => {
    expect(stayWindow('2026-09-01', '2026-09-01').to).toBe('2026-09-01');
  });

  // A window that collapsed to nothing would report "available" without checking anything.
  it('never returns an empty window when the leave date precedes the joining date', () => {
    const w = stayWindow('2026-09-10', '2026-09-02');
    expect(w.to).toBe('2026-09-10');
  });

  it('reads the day out of a value that carries a time', () => {
    expect(stayWindow('2026-09-01T14:30', '2026-09-03T11:00').from).toBe('2026-09-01');
  });

  /**
   * A tenancy with no end date has no end to check. The horizon is an assumption, so the
   * verdict carries `openEnded` and the message says which window it looked at.
   */
  it('checks a fixed horizon when no leave date is given', () => {
    const w = stayWindow('2026-09-01', '');
    expect(w.openEnded).toBe(true);
    expect(w.to).toBe(shiftDay('2026-09-01', OPEN_ENDED_HORIZON_DAYS - 1));
  });
});

describe('assessAvailability', () => {
  it('clears a room with a bed free every night', () => {
    const v = assessAvailability(days(4, { '2026-09-02': 3 }), 4);

    expect(v.ok).toBe(true);
    expect(v.firstBlocked).toBeNull();
    expect(v.peakBooked).toBe(3);
  });

  // The bed count is the only difference between the two kinds of room: a dorm refuses at
  // capacity, a private room refuses at one, and both are `booked >= capacity`.
  it('refuses a shared room only once every bed is taken', () => {
    const full = assessAvailability(days(4, { '2026-09-03': 4 }), 4);
    expect(full.ok).toBe(false);
    expect(full.firstBlocked).toBe('2026-09-03');

    expect(assessAvailability(days(4, { '2026-09-03': 3 }), 4).ok).toBe(true);
  });

  it('refuses a private room on a single occupied night', () => {
    const v = assessAvailability(days(1, { '2026-09-03': 1 }), 1);

    expect(v.ok).toBe(false);
    expect(v.blockedNights).toBe(1);
  });

  it('reports the first blocked night and how many there are', () => {
    const v = assessAvailability(
      days(2, { '2026-09-04': 2, '2026-09-05': 2, '2026-09-08': 2 }),
      2,
    );

    expect(v.firstBlocked).toBe('2026-09-04');
    expect(v.blockedNights).toBe(3);
  });

  // An oversold room is past full, not merely at it, and must not read as one bed spare.
  it('treats an oversold night as blocked', () => {
    const v = assessAvailability(days(2, { '2026-09-04': 5 }), 2);

    expect(v.ok).toBe(false);
    expect(v.peakBooked).toBe(5);
  });

  it('names the window it examined', () => {
    const v = assessAvailability(days(4, {}, 3, 9), 4);

    expect(v.from).toBe('2026-09-03');
    expect(v.to).toBe('2026-09-09');
  });

  /**
   * Says how it knows. A monthly hostel answers from a present-tense occupancy count off the
   * rooms list instead, and the message has to differ: naming a date there would dress a
   * standing fact up as a finding about the range the host happened to type.
   */
  it('reports that it walked the dates', () => {
    expect(assessAvailability(days(4, {}), 4).basis).toBe('dates');
  });
});
