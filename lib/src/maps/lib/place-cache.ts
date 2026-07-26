/// <reference types="google.maps" />
import { Injectable } from '@angular/core';

/** One autocomplete prediction, in the shape the search dropdown renders. */
export interface PlaceSuggestion {
  id: string;
  main: string;
  secondary: string;
  prediction: google.maps.places.PlacePrediction;
}

/**
 * Autocomplete results shared by every `hh-place-search` in the app.
 *
 * Autocomplete is billed per request and the same handful of Pakistani cities gets typed
 * over and over — in the header bar, again in the search page's own input, again after
 * navigating back. A component-local cache misses all of those: each field is a separate
 * instance, and routing destroys them. Living at the root, this one outlives any single
 * field and covers the whole browsing session.
 *
 * Purely in-memory — it dies with the tab, so nothing is persisted between visits.
 */
@Injectable({ providedIn: 'root' })
export class PlaceSuggestionCache {
  private readonly entries = new Map<string, PlaceSuggestion[]>();

  get(query: string, primaryTypes: readonly string[]): PlaceSuggestion[] | undefined {
    return this.entries.get(cacheKey(query, primaryTypes));
  }

  set(
    query: string,
    primaryTypes: readonly string[],
    suggestions: PlaceSuggestion[],
  ): void {
    this.entries.set(cacheKey(query, primaryTypes), suggestions);
  }
}

/**
 * The type filter is part of the identity: some fields restrict to cities and others do
 * not, so "lahore" asked two different ways is two different questions and must not share
 * an entry.
 */
function cacheKey(query: string, primaryTypes: readonly string[]): string {
  return `${[...primaryTypes].sort().join(',')}|${query.trim().toLowerCase()}`;
}
