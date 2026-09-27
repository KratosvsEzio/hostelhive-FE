/**
 * IANA time zones, for the hostel time zone a host picks (Trello #81).
 *
 * A hostel's bookings, invoices and bills are in the property's own clock, so the zone is part
 * of the hostel: the API takes it on create (required) and returns it as `timezone`.
 */

/** Used where the runtime cannot list its zones (an older engine) — the ones this market needs. */
const FALLBACK_ZONES = [
  'Asia/Karachi',
  'Asia/Dubai',
  'Asia/Riyadh',
  'Asia/Kolkata',
  'Asia/Dhaka',
  'Asia/Kabul',
  'Asia/Tehran',
  'Asia/Istanbul',
  'Europe/London',
  'Europe/Lisbon',
  'Europe/Berlin',
  'America/New_York',
  'America/Chicago',
  'America/Los_Angeles',
  'Australia/Sydney',
  'UTC',
];

/** The zone the host is in — the likely answer for a hostel they are adding, and only that. */
export function browserTimeZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'Asia/Karachi';
  } catch {
    return 'Asia/Karachi';
  }
}

/** Every zone the runtime knows, as IANA names. `supportedValuesOf` is ES2022, hence the guard. */
export function allTimeZones(): string[] {
  const intl = Intl as typeof Intl & { supportedValuesOf?: (key: 'timeZone') => string[] };
  try {
    const zones = intl.supportedValuesOf?.('timeZone');
    if (zones?.length) return zones.includes('UTC') ? zones : [...zones, 'UTC'];
  } catch {
    // fall through
  }
  return FALLBACK_ZONES;
}

/**
 * "GMT+5", "GMT+1", "GMT" — the zone's offset right now, so a host picking "Europe/Lisbon"
 * sees what that means. Empty when the engine cannot say.
 */
export function zoneOffsetLabel(zone: string, at: Date = new Date()): string {
  for (const timeZoneName of ['shortOffset', 'short'] as const) {
    try {
      const part = new Intl.DateTimeFormat('en-US', { timeZone: zone, timeZoneName })
        .formatToParts(at)
        .find((p) => p.type === 'timeZoneName');
      if (part?.value) return part.value;
    } catch {
      // an older engine without shortOffset; try the next form
    }
  }
  return '';
}

/** Whether a name is one the runtime recognises — the same test the server's validation makes. */
export function isKnownTimeZone(zone: string | null | undefined): boolean {
  if (!zone) return false;
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: zone });
    return true;
  } catch {
    return false;
  }
}
