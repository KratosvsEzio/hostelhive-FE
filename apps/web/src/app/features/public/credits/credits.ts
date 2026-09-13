import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { LocaleLink } from '@core/i18n/locale-link';
import HERO_CREDITS from '../../../../../public/hero/CREDITS.json';
import CITY_CREDITS from '../../../../../public/cities/CREDITS.json';

/**
 * One photograph, as the page renders it.
 *
 * Flattened from two shapes, because the images now come from two places. A Commons file names
 * a photographer who must be credited; a Pexels file names nobody and requires no credit at
 * all. Rather than render "Photo by Unknown" for the second kind, each record carries the
 * credit line its own licence actually calls for, and this page prints that.
 */
export interface Credit {
  file: string;
  subject: string;
  attribution: string;
  licence: string;
  licenceUrl: string;
  /** The Commons file page, or the Pexels photo page — wherever the terms can be read. */
  sourceUrl: string;
  sourceLabel: string;
  note?: string;
}

interface RawCredit {
  file: string;
  label?: string;
  landmark?: string;
  author?: string;
  attribution?: string;
  licence?: string;
  licenceUrl?: string;
  commonsPage?: string;
  source?: string;
  note?: string;
}

/**
 * The credit files, flattened.
 *
 * Imported rather than fetched so the page renders on the server as well as in the browser.
 * A credits page that arrives empty until JavaScript runs is no use to the one audience that
 * has to be able to read it — someone checking whether we honoured a licence — and the same
 * goes for a crawler. It is the same file the site serves as a static asset, so the page and
 * the record cannot drift.
 */
export function toCredits(raw: readonly RawCredit[]): Credit[] {
  return raw.map((r) => ({
    file: r.file,
    subject: r.label ?? r.landmark ?? r.file,
    attribution: r.attribution ?? (r.author ? `Photo by ${r.author}` : 'Unknown'),
    licence: r.licence ?? 'Unknown',
    licenceUrl: r.licenceUrl ?? '',
    sourceUrl: r.commonsPage ?? r.source ?? '',
    sourceLabel: r.commonsPage ? 'View on Wikimedia Commons' : 'View on Pexels',
    note: r.note,
  }));
}

/**
 * Who took the photographs, and under what terms.
 *
 * Every hero and city image is a crop of a Wikimedia Commons photograph, and every one of them
 * carries an attribution condition — most are share-alike, one is the Free Art License, and one
 * states in its own words that a named site must be credited. Recording the source in
 * `CREDITS.json` made attribution *possible*; this page is where it is actually *given*.
 *
 * The licence names and credit lines are English on purpose, like the legal pages: "CC BY-SA
 * 4.0" is the name of an instrument, not copy, and a translated approximation of a licence
 * condition would be worth less than the original to anyone checking it.
 */
@Component({
  selector: 'app-credits',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, LocaleLink, TranslocoPipe],
  templateUrl: './credits.html',
})
export class Credits {
  protected readonly groups: { heading: string; items: Credit[] }[] = [
    { heading: 'Home page photographs', items: toCredits(HERO_CREDITS.images as RawCredit[]) },
    { heading: 'City photographs', items: toCredits(CITY_CREDITS.images as RawCredit[]) },
  ];
}
