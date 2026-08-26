import { signal } from '@angular/core';

/**
 * The seeker's analytics choice, persisted in localStorage.
 *
 * Deliberately not a cookie: the choice itself is a preference, and storing it in a cookie
 * would mean setting a cookie in order to record that cookies were refused.
 */
const KEY = 'hh.consent.analytics';

export type ConsentState = 'granted' | 'denied' | 'unset';

function read(): ConsentState {
  if (typeof localStorage === 'undefined') return 'unset'; // SSR
  const v = localStorage.getItem(KEY);
  return v === 'granted' || v === 'denied' ? v : 'unset';
}

/**
 * Current choice. Starts `'unset'` on the server so the banner never renders into the SSR
 * HTML — the server cannot know what this visitor previously chose, and guessing would
 * either flash a banner at someone who already answered or hide it from someone who has not.
 */
export const googleAnalyticsConsent = signal<ConsentState>('unset');

/** Reads the stored choice into the signal. Browser only; safe to call more than once. */
export function restoreGoogleAnalyticsConsent(): void {
  googleAnalyticsConsent.set(read());
}

export function setGoogleAnalyticsConsent(state: Exclude<ConsentState, 'unset'>): void {
  if (typeof localStorage !== 'undefined') localStorage.setItem(KEY, state);
  googleAnalyticsConsent.set(state);
}

/** For a "withdraw consent" control in settings, and for tests. */
export function clearGoogleAnalyticsConsent(): void {
  if (typeof localStorage !== 'undefined') localStorage.removeItem(KEY);
  googleAnalyticsConsent.set('unset');
}
