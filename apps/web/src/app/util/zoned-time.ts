/**
 * Reading a wall clock in another part of the world.
 *
 * A `Date` is an instant, and every way JavaScript has of building one from calendar parts
 * builds it in the browser's own zone — `new Date(2026, 8, 20, 14, 0)` is 2pm *here*. What a
 * booking needs is 2pm *there*: check-in is an arrangement with a hostel, so it is their
 * afternoon, not the guest's.
 *
 * Done with `Intl` rather than a timezone library. The zone database is already in the
 * browser, kept current by the browser, and this needs one operation out of it — a library
 * would be a dependency carrying a second copy of the same data.
 */

/**
 * How far ahead of UTC `timeZone` is at a given instant, in milliseconds.
 *
 * Read by asking `Intl` what the clock there says at that instant and treating the answer as
 * though it were UTC: the gap between the two is the offset. Positive east of Greenwich.
 */
function zoneOffsetMs(instantMs: number, timeZone: string): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hour12: false,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(new Date(instantMs));

  const at = (type: Intl.DateTimeFormatPartTypes): number => {
    const found = parts.find((p) => p.type === type);
    return found ? Number(found.value) : 0;
  };

  // `hour12: false` reports midnight as 24 in some engines, which `Date.UTC` would roll
  // forward into the next day.
  const hour = at('hour') % 24;
  const asIfUtc = Date.UTC(at('year'), at('month') - 1, at('day'), hour, at('minute'), at('second'));
  return asIfUtc - instantMs;
}

/**
 * The instant at which the clock in `timeZone` reads the given calendar date and time.
 *
 * The offset has to be read *at the instant being solved for*, and that instant is what is
 * being worked out — so the first pass reads the offset at an approximation and the second
 * re-reads it at the corrected answer. One pass is exact everywhere except within a day of a
 * daylight-saving change, where the approximation can land on the wrong side of the jump;
 * two converge. Pakistan keeps no daylight saving, so the home market never needs the second
 * pass, and the countries this will meet next do.
 *
 * A wall time that daylight saving skips (2:30am on a spring-forward night) does not exist —
 * the answer is the instant the clock jumps to, which is what falls out of this rather than
 * being special-cased.
 *
 * @param month 1-indexed, unlike `Date`.
 */
export function zonedWallTimeToUtc(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
  timeZone: string,
): Date {
  const wallAsUtc = Date.UTC(year, month - 1, day, hour, minute);
  let instant = wallAsUtc;
  for (let pass = 0; pass < 2; pass++) {
    instant = wallAsUtc - zoneOffsetMs(instant, timeZone);
  }
  return new Date(instant);
}

/**
 * The same, taking the calendar date off a `Date` that was built in the browser's zone.
 *
 * The date pickers hand back local midnights, and only the year, month and day of those are
 * meaningful — the time on them is an artefact of how they were constructed. This reads those
 * three and discards the rest, which is what stops a hostel in Lahore being booked for the
 * 19th because the guest's browser was five hours behind.
 */
export function localDateAtWallTime(
  localDate: Date,
  hour: number,
  minute: number,
  timeZone: string,
): Date {
  return zonedWallTimeToUtc(
    localDate.getFullYear(),
    localDate.getMonth() + 1,
    localDate.getDate(),
    hour,
    minute,
    timeZone,
  );
}
