import { allTimeZones, browserTimeZone, isKnownTimeZone, zoneOffsetLabel } from './time-zones';

describe('time zones', () => {
  it('pre-fills from the browser, as an IANA name the server accepts', () => {
    const zone = browserTimeZone();
    expect(zone).toBeTruthy();
    expect(isKnownTimeZone(zone)).toBe(true);
  });

  it('lists the zones this market needs, and UTC', () => {
    const zones = allTimeZones();
    for (const z of ['Asia/Karachi', 'Europe/Lisbon', 'UTC']) expect(zones).toContain(z);
  });

  it('labels a zone with its offset at a given moment', () => {
    // Karachi has no daylight saving; Lisbon is +1 in summer, +0 in winter.
    expect(zoneOffsetLabel('Asia/Karachi', new Date('2026-07-01T12:00:00Z'))).toBe('GMT+5');
    expect(zoneOffsetLabel('Europe/Lisbon', new Date('2026-07-01T12:00:00Z'))).toBe('GMT+1');
    expect(zoneOffsetLabel('Europe/Lisbon', new Date('2026-01-15T12:00:00Z'))).toBe('GMT');
  });

  it('tells a real zone from a made-up one — the same test the server makes', () => {
    expect(isKnownTimeZone('Asia/Karachi')).toBe(true);
    expect(isKnownTimeZone('Mars/Olympus')).toBe(false);
    expect(isKnownTimeZone('')).toBe(false);
    expect(isKnownTimeZone(null)).toBe(false);
  });
});
