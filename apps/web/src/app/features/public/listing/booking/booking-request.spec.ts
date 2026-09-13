import { BasketLine } from './room-offer';
import { toBookingRequest, toLineItem } from './booking-request';

const GUEST = { name: 'Ali Raza', phone: '923001234567', email: 'ali@example.com' };

function line(over: Partial<BasketLine> = {}): BasketLine {
  return {
    roomId: 'KGJwMC',
    title: 'King size room',
    kind: 'private',
    quantity: 2,
    unitPrice: 10_000,
    actualPrice: 12_000,
    capacity: 4,
    guests: 4,
    ...over,
  };
}

function request(over: { lines?: BasketLine[]; country?: string | null } = {}) {
  return toBookingRequest({
    hostelId: 'MjvuEl',
    hostelCountry: over.country === undefined ? 'Pakistan' : over.country,
    checkIn: new Date(2026, 8, 20), // 20 September, local midnight
    checkOut: new Date(2026, 8, 23),
    lines: over.lines ?? [line()],
    guest: GUEST,
  });
}

describe('toLineItem', () => {
  /**
   * `guests` is the headcount on the line, not per room. Two rooms sleeping four each, taken
   * by a party of four, is `{guests: 4, quantity: 2}` — the case that makes the distinction
   * visible, since per-room would read 8.
   */
  it('sends rooms and the headcount on a private line', () => {
    expect(toLineItem(line({ quantity: 2, capacity: 4, guests: 4 }))).toEqual({
      room_type_id: 'KGJwMC',
      guests: 4,
      quantity: 2,
    });
  });

  /**
   * A shared line is sold by the bed and seats one person per bed, so its bed count and its
   * headcount are the same number. Sending both would say it twice, and two numbers that
   * must agree are two numbers that can disagree.
   */
  it('sends beds as the headcount on a shared line, with no quantity', () => {
    const item = toLineItem(line({ roomId: 'MqVuEl', kind: 'shared', quantity: 2, guests: 2 }));

    expect(item).toEqual({ room_type_id: 'MqVuEl', guests: 2 });
    expect('quantity' in item).toBe(false);
  });

  it('carries the room type id the listing gave it', () => {
    expect(toLineItem(line({ roomId: 'abc123' })).room_type_id).toBe('abc123');
  });
});

describe('toBookingRequest', () => {
  it('nests everything but the hostel under `booking`', () => {
    const req = request();

    expect(req.hostel_id).toBe('MjvuEl');
    expect(Object.keys(req).sort()).toEqual(['booking', 'hostel_id']);
  });

  /**
   * 2pm and 11am **on the hostel's clock**, sent as UTC. Pakistan is five hours ahead, so a
   * 2pm check-in is 09:00Z. Reading the browser's zone instead is the bug this prevents, and
   * in the home market it is a five-hour error — enough to move a check-in onto the day before.
   */
  it('puts check-in at 2pm and check-out at 11am, in the hostel country', () => {
    const { booking } = request();

    expect(booking.checkin_date).toBe('2026-09-20T09:00:00.000Z');
    expect(booking.checkout_date).toBe('2026-09-23T06:00:00.000Z');
  });

  it('resolves the times against a different country', () => {
    // Sydney in September is on standard time, ten hours ahead.
    const { booking } = request({ country: 'Australia' });

    expect(booking.checkin_date).toBe('2026-09-20T04:00:00.000Z');
  });

  // An unrecognised country falls back to UTC rather than guessing — see `countryTimeZone`.
  it('falls back to UTC for a country it does not know', () => {
    expect(request({ country: 'Atlantis' }).booking.checkin_date).toBe('2026-09-20T14:00:00.000Z');
    expect(request({ country: null }).booking.checkin_date).toBe('2026-09-20T14:00:00.000Z');
  });

  it('keeps the calendar dates the picker showed', () => {
    const { booking } = request();

    expect(booking.checkin_date.slice(0, 10)).toBe('2026-09-20');
    expect(booking.checkout_date.slice(0, 10)).toBe('2026-09-23');
  });

  it('carries the guest details', () => {
    const { booking } = request();

    expect(booking.guest_name).toBe('Ali Raza');
    expect(booking.guest_email).toBe('ali@example.com');
    expect(booking.guest_phone).toBe('923001234567');
  });

  /**
   * The phone input renders numbers spaced for reading and the API takes them plain. Stripped
   * here rather than in the field, so what the guest typed stays legible where they typed it.
   */
  it('sends the phone as digits', () => {
    const req = toBookingRequest({
      hostelId: 'MjvuEl',
      hostelCountry: 'Pakistan',
      checkIn: new Date(2026, 8, 20),
      checkOut: new Date(2026, 8, 23),
      lines: [line()],
      guest: { ...GUEST, phone: '+92 300 123 4567' },
    });

    expect(req.booking.guest_phone).toBe('923001234567');
  });

  it('trims the name and email', () => {
    const req = toBookingRequest({
      hostelId: 'MjvuEl',
      hostelCountry: 'Pakistan',
      checkIn: new Date(2026, 8, 20),
      checkOut: new Date(2026, 8, 23),
      lines: [line()],
      guest: { name: '  Ali Raza  ', phone: '923001234567', email: ' ali@example.com ' },
    });

    expect(req.booking.guest_name).toBe('Ali Raza');
    expect(req.booking.guest_email).toBe('ali@example.com');
  });

  it('sends every line, in basket order', () => {
    const { booking } = request({
      lines: [
        line({ roomId: 'KGJwMC', quantity: 2, capacity: 4, guests: 4 }),
        line({ roomId: 'MqVuEl', kind: 'shared', quantity: 1, guests: 1 }),
      ],
    });

    expect(booking.line_items).toEqual([
      { room_type_id: 'KGJwMC', guests: 4, quantity: 2 },
      { room_type_id: 'MqVuEl', guests: 1 },
    ]);
  });

  // The shape in the API's own example, reproduced end to end.
  it('reproduces the documented example', () => {
    const { booking } = request({
      lines: [
        line({ roomId: 'KGJwMC', quantity: 2, capacity: 4, guests: 4 }),
        line({ roomId: 'MqVuEl', kind: 'shared', quantity: 2, guests: 2 }),
      ],
    });

    expect(booking.line_items).toEqual([
      { room_type_id: 'KGJwMC', guests: 4, quantity: 2 },
      { room_type_id: 'MqVuEl', guests: 2 },
    ]);
  });
});
