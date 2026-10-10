import { provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { PLATFORM_ID } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { firstValueFrom } from 'rxjs';
import { SUPPRESS_ERROR_TOAST } from '@core/tokens';
import { GeoCity, PopularCities, parseGeoCities } from './popular-cities';

const GB: GeoCity[] = [
  { name: 'London', lat: 51.5085, lng: -0.1257, population: 8961989 },
  { name: 'Birmingham', lat: 52.4814, lng: -1.8998, population: 1157603 },
];

function setUp(platform: 'browser' | 'server' = 'browser'): {
  cities: PopularCities;
  http: HttpTestingController;
} {
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    providers: [
      provideHttpClient(),
      provideHttpClientTesting(),
      { provide: PLATFORM_ID, useValue: platform },
    ],
  });
  return {
    cities: TestBed.inject(PopularCities),
    http: TestBed.inject(HttpTestingController),
  };
}

describe('PopularCities', () => {
  it('loads the country’s file, most populous first as written', async () => {
    const { cities, http } = setUp();
    const answer = firstValueFrom(cities.forCountry('gb'));

    const req = http.expectOne('/geo/cities/GB.json');
    // A missing country is routine, so it must not raise the app-wide error toast.
    expect(req.request.context.get(SUPPRESS_ERROR_TOAST)).toBe(true);
    req.flush(GB);

    expect(await answer).toEqual(GB);
    http.verify();
  });

  it('answers with no cities when the country has no file', async () => {
    const { cities, http } = setUp();
    const answer = firstValueFrom(cities.forCountry('XX'));

    http
      .expectOne('/geo/cities/XX.json')
      .flush('Not found', { status: 404, statusText: 'Not Found' });

    expect(await answer).toEqual([]);
  });

  // The server renders the app for a path it has no file for, so "missing" can arrive as HTML.
  it('answers with no cities when the file is not a list of cities', async () => {
    const { cities, http } = setUp();
    const answer = firstValueFrom(cities.forCountry('XX'));

    http.expectOne('/geo/cities/XX.json').flush({ html: '<!doctype html>' });

    expect(await answer).toEqual([]);
  });

  it('asks for nothing during SSR', async () => {
    const { cities, http } = setUp('server');

    expect(await firstValueFrom(cities.forCountry('GB'))).toEqual([]);
    http.expectNone(() => true);
  });

  it('asks for nothing for something that is not a country code', async () => {
    const { cities, http } = setUp();

    expect(await firstValueFrom(cities.forCountry('../x'))).toEqual([]);
    http.expectNone(() => true);
  });
});

describe('parseGeoCities', () => {
  it('keeps well-formed cities and drops the rest', () => {
    expect(
      parseGeoCities([
        GB[0],
        { name: '', lat: 1, lng: 1, population: 1 },
        { name: 'No coordinates', population: 1 },
        null,
        'Paris',
        GB[1],
      ]),
    ).toEqual(GB);
  });

  it('reads anything that is not a list as no cities', () => {
    expect(parseGeoCities(null)).toEqual([]);
    expect(parseGeoCities('<!doctype html>')).toEqual([]);
    expect(parseGeoCities({ GB })).toEqual([]);
  });
});
