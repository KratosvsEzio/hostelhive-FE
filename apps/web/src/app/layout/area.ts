import { routePath } from '@core/i18n/locales';

export type Area = 'seeker' | 'host' | 'admin' | 'moderator' | 'auth';

/**
 * Which area of the app a URL belongs to.
 *
 * One definition, because a second one drifts — and the `/host` case is the kind that drifts
 * quietly. `/hostel/:id` is a public listing page sharing its first five letters with the host
 * console, so a `startsWith('/host')` written from memory puts every seeker reading a listing
 * into console chrome, and nothing about that looks like a bug until somebody reports it.
 *
 * Takes either a raw URL or an already-stripped route path: {@link routePath} is a no-op on
 * the second, so a caller does not have to know which one it is holding.
 */
export function areaOf(url: string): Area {
  const u = routePath(url) || '/';
  if (u.startsWith('/admin')) return 'admin';
  if (u.startsWith('/moderator')) return 'moderator';
  if (u === '/host' || u.startsWith('/host/')) return 'host';
  if (u.startsWith('/auth') || u.startsWith('/confirm_invitation')) return 'auth';
  return 'seeker';
}

/**
 * The three areas that are a console rather than the site itself.
 *
 * What they have in common is that a signed-in user can end up inside one and need a way back
 * out to the public pages — which is the only thing any caller asks this.
 */
export function isConsoleArea(area: Area): boolean {
  return area === 'host' || area === 'admin' || area === 'moderator';
}
