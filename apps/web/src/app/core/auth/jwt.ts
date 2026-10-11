/**
 * Minimal JWT payload reader.
 *
 * A JWT's payload is base64url-encoded JSON — readable without the signing secret, which is
 * why this needs no library and no backend round trip. It is **not** verification: nothing
 * here proves the token is authentic, only what it claims. The server remains the authority
 * on validity; this exists so the app can skip a request it already knows will 401.
 */

/**
 * Claims we read. Anything else in the payload is ignored. `expiry` is the backend's own
 * deadline claim, issued instead of the standard `exp`; `name` and `email` are for display only.
 */
interface JwtClaims {
  exp?: unknown;
  expiry?: unknown;
  iat?: unknown;
  name?: unknown;
  email?: unknown;
}

function decodePayload(token: string): JwtClaims | null {
  const parts = token.split('.');
  if (parts.length !== 3) return null; // not a JWT (opaque token) — caller must not assume
  try {
    // base64url → base64, then pad to a multiple of 4.
    const b64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const padded = b64.padEnd(b64.length + ((4 - (b64.length % 4)) % 4), '=');
    const json =
      typeof atob === 'function'
        ? decodeURIComponent(
            atob(padded)
              .split('')
              .map((c) => '%' + c.charCodeAt(0).toString(16).padStart(2, '0'))
              .join(''),
          )
        : Buffer.from(padded, 'base64').toString('utf8');
    const parsed: unknown = JSON.parse(json);
    return typeof parsed === 'object' && parsed !== null ? (parsed as JwtClaims) : null;
  } catch {
    return null; // malformed base64 or JSON — treat as unreadable, never as expired
  }
}

/**
 * Expiry as epoch milliseconds, or `null` when the token is not a JWT, carries no readable
 * expiry, or cannot be parsed. `null` means "unknown", never "expired" — callers must leave the
 * session alone in that case and let the server decide.
 *
 * The standard `exp` (seconds since epoch) wins. Without it the backend's `expiry` claim is
 * read: a number is seconds since epoch, a string a timestamp with an explicit zone — the
 * backend's likely form, Rails' `TimeWithZone#to_s` (`2026-10-11 16:07:00 UTC`), then ISO 8601
 * (`2026-10-11T21:07:00.000+05:00`) or Ruby's `Time#to_s` (`2026-10-11 21:07:00 +0500`).
 */
export function jwtExpiresAt(token: string): number | null {
  const claims = decodePayload(token);
  if (!claims) return null;
  if (claims.exp !== undefined) return secondsToMs(claims.exp);
  const { expiry } = claims;
  if (typeof expiry === 'string') return parseTimestamp(expiry);
  return secondsToMs(expiry);
}

/** Issued-at as epoch milliseconds, or `null`. Used to sanity-check the device clock. */
export function jwtIssuedAt(token: string): number | null {
  return secondsToMs(decodePayload(token)?.iat);
}

/**
 * The account the token was issued to, as its payload claims it — for display only (naming
 * who is signed in), never for an access decision. `null` when the token is unreadable or names
 * nobody.
 */
export function jwtDisplayIdentity(
  token: string,
): { name?: string; email?: string } | null {
  const claims = decodePayload(token);
  const name = nonBlank(claims?.name);
  const email = nonBlank(claims?.email);
  if (!name && !email) return null;
  return { ...(name && { name }), ...(email && { email }) };
}

function secondsToMs(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value * 1000 : null;
}

/** Date, time, optional fraction, then a zone: `Z`, ` UTC`, ` GMT`, `+05:00` or `+0500`. */
const TIMESTAMP =
  /^(\d{4}-\d{2}-\d{2})[T ](\d{2}:\d{2}:\d{2})(?:\.(\d+))?(?:(Z)| ?(?:UTC|GMT)| ?([+-]\d{2}:?\d{2}))$/;

/**
 * A timestamp string as epoch milliseconds, or `null`. A string without a zone is rejected
 * rather than read as device-local time — an unknown expiry keeps the session, a wrong one ends it.
 */
function parseTimestamp(value: string): number | null {
  const match = TIMESTAMP.exec(value.trim());
  if (!match) return null;
  const [, date, time, fraction = '', , numericZone] = match;
  const millis = fraction.slice(0, 3).padEnd(3, '0');
  // `Z`, `UTC` and `GMT` all leave the numeric group empty and mean the same instant.
  const offset = numericZone
    ? `${numericZone.slice(0, 3)}:${numericZone.slice(-2)}`
    : 'Z';
  const ms = Date.parse(`${date}T${time}.${millis}${offset}`);
  return Number.isFinite(ms) ? ms : null;
}

function nonBlank(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

/**
 * Tolerance for a device clock that runs fast. Without it a phone a minute ahead would throw
 * away a token the server still accepts — the exact "logged out for no reason" failure this
 * whole area is meant to avoid, so the check errs towards keeping the session.
 */
const CLOCK_SKEW_MS = 60_000;

/**
 * True only when the token is definitively past its own expiry.
 *
 * Returns false for an unreadable token, a token with no readable expiry (`exp` or `expiry`),
 * and — deliberately — for a token whose `iat` is in the future, which means the device clock is
 * wrong rather than the token being old. In every one of those cases the server gets to decide.
 * A token without `iat` (the backend issues none) skips that clock check.
 */
export function isJwtExpired(token: string, now: number = Date.now()): boolean {
  const exp = jwtExpiresAt(token);
  if (exp === null) return false;

  const iat = jwtIssuedAt(token);
  if (iat !== null && iat > now + CLOCK_SKEW_MS) return false; // clock is behind; don't trust it

  return now > exp + CLOCK_SKEW_MS;
}
