import { isJwtExpired, jwtExpiresAt, jwtIssuedAt } from './jwt';

/** Builds a JWT with a real base64url payload. The signature is never inspected. */
function token(claims: Record<string, unknown>): string {
  const b64url = (o: unknown): string =>
    btoa(JSON.stringify(o)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  return `${b64url({ alg: 'HS256', typ: 'JWT' })}.${b64url(claims)}.sig`;
}

const NOW = 1_700_000_000_000; // fixed clock; seconds → ms conversions below use it
const sec = (ms: number): number => Math.floor(ms / 1000);

describe('jwtExpiresAt', () => {
  it('returns the exp claim in milliseconds', () => {
    expect(jwtExpiresAt(token({ exp: sec(NOW) }))).toBe(sec(NOW) * 1000);
  });

  it('returns null for a token with no exp', () => {
    expect(jwtExpiresAt(token({ sub: 'abc' }))).toBeNull();
  });

  it('returns null for an opaque, non-JWT token', () => {
    expect(jwtExpiresAt('not-a-jwt')).toBeNull();
  });

  it('returns null for a malformed payload rather than throwing', () => {
    expect(jwtExpiresAt('a.!!!not-base64!!!.c')).toBeNull();
  });

  it('returns null when exp is not a number', () => {
    expect(jwtExpiresAt(token({ exp: '1700000000' }))).toBeNull();
  });

  it('reads iat too', () => {
    expect(jwtIssuedAt(token({ iat: sec(NOW) }))).toBe(sec(NOW) * 1000);
  });
});

describe('isJwtExpired', () => {
  it('is true well past expiry', () => {
    expect(isJwtExpired(token({ exp: sec(NOW - 3_600_000) }), NOW)).toBe(true);
  });

  it('is false before expiry', () => {
    expect(isJwtExpired(token({ exp: sec(NOW + 3_600_000) }), NOW)).toBe(false);
  });

  // A phone running a little fast must not discard a token the server still honours.
  it('tolerates a device clock inside the skew allowance', () => {
    expect(isJwtExpired(token({ exp: sec(NOW - 30_000) }), NOW)).toBe(false);
  });

  // "Unknown" must never be treated as "expired" — the server decides in these cases.
  it.each([
    ['an opaque token', 'not-a-jwt'],
    ['a token with no exp', token({ sub: 'abc' })],
    ['a malformed payload', 'a.!!!.c'],
  ])('is false for %s', (_label, value) => {
    expect(isJwtExpired(value, NOW)).toBe(false);
  });

  it('is false when iat is in the future, since the clock is wrong not the token', () => {
    const t = token({ iat: sec(NOW + 86_400_000), exp: sec(NOW - 3_600_000) });
    expect(isJwtExpired(t, NOW)).toBe(false);
  });
});
