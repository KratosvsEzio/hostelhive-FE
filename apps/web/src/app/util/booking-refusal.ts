import { errorStatus, serverText } from '@core/errors/api-error-text';

/** Why the backend refused to create, change or cancel a booking, as far as a screen needs to know. */
export type BookingRefusal =
  | 'bookingsClosed'
  | 'noLongerChangeable'
  | 'withinCutoff'
  | 'checkInPast'
  | 'datesOutOfOrder'
  | 'roomNotBookable';

interface RefusalMatcher {
  readonly kind: BookingRefusal;
  /** Matches the backend's own wording, normalised. */
  readonly exact: (text: string) => boolean;
  /** Matches a reworded message that still says the same thing. */
  readonly keyword: RegExp;
}

/** Priority order: when several messages come back, the first kind listed here wins. */
const MATCHERS: readonly RefusalMatcher[] = [
  {
    kind: 'bookingsClosed',
    exact: (text) =>
      text === 'this hostel does not accept bookings' ||
      text === 'this hostel is not taking bookings right now',
    keyword: /\b(does not|doesn't) accept bookings\b|\bnot taking bookings\b/,
  },
  {
    kind: 'noLongerChangeable',
    exact: (text) =>
      text === 'this booking can no longer be updated' ||
      text === 'this booking can no longer be cancelled',
    keyword: /\bcan no longer be (updated|cancell?ed|changed)\b/,
  },
  {
    kind: 'withinCutoff',
    exact: (text) =>
      text === 'bookings cannot be updated within 3 days of check-in' ||
      text === 'bookings cannot be cancelled within 3 days of check-in',
    keyword: /\bwithin \d+ days? of check-?in\b/,
  },
  {
    kind: 'checkInPast',
    exact: (text) => text === 'checkin date cannot be in the past',
    keyword: /\bcheck-?in\b.*\bin the past\b/,
  },
  {
    kind: 'datesOutOfOrder',
    exact: (text) => text === 'checkout date must be after check-in date',
    keyword: /\bcheck-?out\b.*\bafter check-?in\b/,
  },
  {
    kind: 'roomNotBookable',
    exact: (text) => /^.+ is not available for booking$/.test(text),
    keyword: /\bnot available for booking\b/,
  },
];

/**
 * Recognises the 422 refusals the backend's `Booking` model and booking controllers send.
 *
 * Only a 422 counts. Each server message is normalised on its own; every message is first
 * compared with the backend's exact wording, in priority order, and only when none matches
 * are the keywords tried, in the same order. Returns `null` for anything else, so callers fall
 * back to their own generic message. `message` is never read.
 */
export function bookingRefusal(err: unknown): BookingRefusal | null {
  if (errorStatus(err) !== 422) return null;

  const texts = serverMessagesOf(err)
    .map((message) => serverText({ serverMessages: [message] }))
    .filter((text) => text.length > 0);
  if (texts.length === 0) return null;

  const exact = MATCHERS.find((matcher) => texts.some((text) => matcher.exact(text)));
  if (exact) return exact.kind;
  const keyword = MATCHERS.find((matcher) => texts.some((text) => matcher.keyword.test(text)));
  return keyword?.kind ?? null;
}

function serverMessagesOf(err: unknown): readonly string[] {
  const { serverMessages } = err as { serverMessages?: unknown };
  if (!Array.isArray(serverMessages)) return [];
  return serverMessages.filter((message): message is string => typeof message === 'string');
}
