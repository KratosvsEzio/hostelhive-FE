/**
 * Rewrites in-app navigation targets to carry the active language prefix.
 *
 * The `:locale` route makes `/de/hostels/lahore` *resolve*, but nothing in the app ever
 * *builds* such a URL — every `routerLink` is written as a plain absolute path. So the
 * prefix survived exactly one page: switching to German landed on `/de`, and the first
 * link click went to `/hostels/lahore`, which the URL-is-truth rule then read as English.
 * The language reverted on every navigation.
 *
 * This is the one place that decides what a localised target looks like, so the anchor's
 * `href` and a programmatic `navigate()` cannot disagree — which matters because the href
 * is what a crawler follows and the navigation is what a person experiences.
 */
import { hasLocalePrefix, withLocale } from './locales';

/** What Angular's `routerLink` accepts, and what `Router.navigate` takes as commands. */
export type LinkCommands = string | readonly unknown[] | null | undefined;

/**
 * `('/hostels/lahore', 'de')` → `/de/hostels/lahore`. Arrays keep their shape, with only
 * the leading segment rewritten: `(['/search', 'lahore'], 'de')` → `['/de/search', 'lahore']`.
 *
 * Left untouched:
 * - **relative** links, which resolve against the current route and therefore already sit
 *   under whatever prefix it has — prefixing them again would nest a second one
 * - anything already prefixed, so passing a value through twice is harmless
 */
export function localiseCommands(commands: LinkCommands, locale: string): LinkCommands {
  if (commands == null) return commands;

  if (typeof commands === 'string') {
    return isAbsoluteUnprefixed(commands) ? withLocale(locale, commands) : commands;
  }

  if (Array.isArray(commands)) {
    const [head, ...rest] = commands;
    if (typeof head !== 'string' || !isAbsoluteUnprefixed(head)) return commands;
    return [withLocale(locale, head), ...rest];
  }

  return commands;
}

/** True for `/foo` but not `foo`, `./foo`, `/de/foo`, or an external URL. */
function isAbsoluteUnprefixed(path: string): boolean {
  if (!path.startsWith('/') || path.startsWith('//')) return false;
  return !hasLocalePrefix(path);
}
