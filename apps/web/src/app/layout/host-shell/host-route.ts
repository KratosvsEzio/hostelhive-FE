import { routePath } from '@core/i18n/locales';

/** Pages a host may still open once the plan has lapsed — see {@link opensWithoutSubscription}. */
const OPEN_WHILE_LAPSED = ['subscription', 'profile'];

/**
 * A host-console URL, below the hostel it names.
 *
 * `/en/host/nHelLt/rooms/edit/r2` → `rooms/edit/r2`; the console root → `''`.
 *
 * Through {@link routePath} rather than indexing the raw URL, because every console URL carries
 * a language: `/en/host/nHelLt/profile` splits to `['en', 'host', 'nHelLt', 'profile']`, and the
 * third segment is the hostel, not the page. Both callers of this were written before English
 * moved to `/en/…` and read the third segment; neither threw when the prefix arrived, because a
 * hostel id is a perfectly good string to compare against — it is just never the right one.
 */
export function hostPagePath(url: string): string {
  // ['host', hostelId, ...page] — routePath has already dropped the language and the query.
  return routePath(url).split('/').filter(Boolean).slice(2).join('/');
}

/**
 * Whether a lapsed subscription still lets this page open.
 *
 * The console is paywalled, and these two are what a host has to reach in order to *stop* it
 * being paywalled: `subscription` is where they pay, and `profile` is the hostel detail a plan
 * is bought against. Bouncing either to the subscription page leaves an expired host circling —
 * and the "complete hostel profile first" link the paywall itself offers would land back on the
 * paywall that offered it.
 *
 * Matched on the first segment, so `subscription/checkout/:productId` is covered: the page a
 * host pays on is not a different question from the page they start paying from.
 */
export function opensWithoutSubscription(url: string): boolean {
  return OPEN_WHILE_LAPSED.includes(hostPagePath(url).split('/')[0]);
}
