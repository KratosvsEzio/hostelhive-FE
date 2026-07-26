import { Route } from '@angular/router';
import { isGuardedUrl, safeInternalUrl } from './guarded-url';

const allow = () => true;

/** Mirrors the shape of the real top-level config: order, prefixes, params, catch-all. */
const routes: Route[] = [
  { path: '', children: [] },
  { path: 'search' },
  { path: 'hostel/:slug' },
  { path: 'account', canActivate: [allow] },
  { path: 'host/listings/new', canActivate: [allow] },
  { path: 'host', canActivate: [allow] },
  { path: 'forbidden' },
  { path: '**', redirectTo: '' },
];

describe('isGuardedUrl', () => {
  it.each(['/search', '/hostel/lums-boys-hostel', '/forbidden', '/'])(
    'treats the public route %j as unguarded',
    (url) => {
      expect(isGuardedUrl(routes, url)).toBe(false);
    },
  );

  it.each([
    '/account',
    '/account/favorites',
    '/account/settings',
    '/host',
    '/host/listings/new',
    '/host/listings/new/payment',
  ])('treats the guarded route %j as guarded', (url) => {
    expect(isGuardedUrl(routes, url)).toBe(true);
  });

  it('ignores the query string and fragment when matching', () => {
    expect(isGuardedUrl(routes, '/account/favorites?page=2#saved')).toBe(true);
    expect(isGuardedUrl(routes, '/search?city=lahore#results')).toBe(false);
  });

  it('matches a guarded prefix regardless of trailing slashes', () => {
    expect(isGuardedUrl(routes, '/account/')).toBe(true);
    expect(isGuardedUrl(routes, '//account//favorites')).toBe(true);
  });

  it('does not let the empty-path route swallow deeper URLs', () => {
    expect(isGuardedUrl([{ path: '', canActivate: [allow] }], '/search')).toBe(
      false,
    );
    expect(isGuardedUrl([{ path: '', canActivate: [allow] }], '/')).toBe(true);
  });

  it('falls through to the catch-all for an unknown path', () => {
    expect(isGuardedUrl(routes, '/nope/nowhere')).toBe(false);
  });

  it('reports a route guarded only by canActivateChild as guarded', () => {
    expect(
      isGuardedUrl([{ path: 'x', canActivateChild: [allow] }], '/x/y'),
    ).toBe(true);
  });

  it('ignores an empty guard array', () => {
    expect(isGuardedUrl([{ path: 'x', canActivate: [] }], '/x')).toBe(false);
  });

  it('respects declaration order when two prefixes overlap', () => {
    const ordered: Route[] = [
      { path: 'a/b' },
      { path: 'a', canActivate: [allow] },
    ];
    expect(isGuardedUrl(ordered, '/a/b')).toBe(false);
    expect(isGuardedUrl(ordered, '/a/c')).toBe(true);
  });
});

describe('safeInternalUrl', () => {
  it.each(['/', '/search', '/hostel/abc?x=1', '/account/favorites#top'])(
    'accepts the internal path %j',
    (url) => {
      expect(safeInternalUrl(url)).toBe(url);
    },
  );

  it.each([
    '//evil.com',
    '///evil.com',
    '/\\evil.com',
    'https://evil.com',
    'http://evil.com',
    'javascript:alert(1)',
    'search',
    '',
  ])('rejects %j', (url) => {
    expect(safeInternalUrl(url)).toBeNull();
  });

  it.each([null, undefined])('rejects %j', (url) => {
    expect(safeInternalUrl(url)).toBeNull();
  });
});
