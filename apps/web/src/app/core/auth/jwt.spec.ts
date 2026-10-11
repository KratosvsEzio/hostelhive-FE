import { isJwtExpired, jwtDisplayIdentity, jwtExpiresAt, jwtIssuedAt } from './jwt';

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

  describe('with the backend expiry claim and no exp', () => {
    const expiresAt = Date.UTC(2026, 9, 11, 16, 7, 0);
    const t = token({ expiry: '2026-10-11T21:07:00.000+05:00' });

    it('is true once past expiry plus the skew allowance', () => {
      expect(isJwtExpired(t, expiresAt + 61_000)).toBe(true);
    });

    it('is false inside the skew allowance', () => {
      expect(isJwtExpired(t, expiresAt + 30_000)).toBe(false);
    });

    it('is false before expiry', () => {
      expect(isJwtExpired(t, expiresAt - 3_600_000)).toBe(false);
    });
  });
});

describe('jwtExpiresAt — the backend expiry claim', () => {
  const expiresAt = Date.UTC(2026, 9, 11, 16, 7, 0);

  it('reads an ISO timestamp with an offset', () => {
    expect(jwtExpiresAt(token({ expiry: '2026-10-11T21:07:00.000+05:00' }))).toBe(expiresAt);
  });

  it('reads a Z timestamp with a six-digit fraction, truncated to milliseconds', () => {
    expect(jwtExpiresAt(token({ expiry: '2026-10-11T16:07:00.123456Z' }))).toBe(expiresAt + 123);
  });

  it("reads Ruby's UTC timestamp form as the same instant", () => {
    expect(jwtExpiresAt(token({ expiry: '2026-10-11 16:07:00 UTC' }))).toBe(expiresAt);
  });

  it("reads Ruby's numeric-offset timestamp form as the same instant", () => {
    expect(jwtExpiresAt(token({ expiry: '2026-10-11 21:07:00 +0500' }))).toBe(expiresAt);
  });

  it('reads a trailing GMT as UTC', () => {
    expect(jwtExpiresAt(token({ expiry: '2026-10-11 16:07:00 GMT' }))).toBe(expiresAt);
  });

  // Only the two UTC names are understood; guessing another zone's offset would be a wrong expiry.
  it.each(['2026-10-11 16:07:00 utc', '2026-10-11 16:07:00 PST'])(
    'returns null for the unsupported zone name in %s',
    (expiry) => {
      expect(jwtExpiresAt(token({ expiry }))).toBeNull();
    },
  );

  it('reads a number as seconds since epoch', () => {
    expect(jwtExpiresAt(token({ expiry: 1_700_000_000 }))).toBe(1_700_000_000_000);
  });

  // Reading a zoneless time as device-local would end a session early or keep it too long.
  it('returns null for a timestamp without a zone', () => {
    expect(jwtExpiresAt(token({ expiry: '2026-10-11 21:07:00' }))).toBeNull();
    expect(jwtExpiresAt(token({ expiry: '2026-10-11T21:07:00' }))).toBeNull();
  });

  it.each([
    ['a word', 'tomorrow'],
    ['an impossible date', '2026-13-45 99:00:00 Z'],
    ['NaN', Number.NaN],
    ['an object', { at: 1 }],
    ['a boolean', true],
  ])('returns null for %s without throwing', (_label, expiry) => {
    expect(jwtExpiresAt(token({ expiry }))).toBeNull();
  });

  it('prefers exp when both claims are present', () => {
    const t = token({ exp: sec(NOW), expiry: '2026-10-11T21:07:00.000+05:00' });
    expect(jwtExpiresAt(t)).toBe(sec(NOW) * 1000);
  });
});

describe('jwtDisplayIdentity', () => {
  it('returns the trimmed name and email', () => {
    expect(jwtDisplayIdentity(token({ name: '  Ayesha  ', email: ' ayesha@h.pk ' }))).toEqual({
      name: 'Ayesha',
      email: 'ayesha@h.pk',
    });
  });

  it('returns just the email when there is no name', () => {
    expect(jwtDisplayIdentity(token({ email: 'ayesha@h.pk' }))).toEqual({ email: 'ayesha@h.pk' });
  });

  it('drops a blank name', () => {
    expect(jwtDisplayIdentity(token({ name: '   ', email: 'ayesha@h.pk' }))).toEqual({
      email: 'ayesha@h.pk',
    });
  });

  it('returns null when the token names nobody', () => {
    expect(jwtDisplayIdentity(token({ name: ' ', email: 3, sub: 'abc' }))).toBeNull();
  });

  it('returns null for a token that is not a JWT', () => {
    expect(jwtDisplayIdentity('not-a-jwt')).toBeNull();
  });
});
