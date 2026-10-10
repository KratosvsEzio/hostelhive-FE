import { PLATFORM_ID, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { firstValueFrom, of, throwError } from 'rxjs';
import { ListingsApi } from '@services';
import { CountryBounds } from '@core/geo/country-bounds';
import { StartupGate } from '@core/startup-gate';
import { PopularCities, cityLink, rankCities } from './popular-cities';

const at = (city: string, lat = 0, lng = 0) => ({ city, lat, lng });

describe('rankCities', () => {
  it('orders cities by how many hostels they have, and keeps four', () => {
    const ranked = rankCities([
      at('Berlin'),
      at('Munich'),
      at('Berlin'),
      at('Hamburg'),
      at('Munich'),
      at('Berlin'),
      at('Cologne'),
      at('Leipzig'),
    ]);
    expect(ranked.map((c) => c.name)).toEqual([
      'Berlin',
      'Munich',
      'Cologne',
      'Hamburg',
    ]);
  });

  it('treats differently typed spellings as one city, shown the way most hostels spell it', () => {
    const ranked = rankCities([
      at('lahore '),
      at('Lahore'),
      at('Lahore'),
      at('Karachi'),
      at('LAHORE'),
    ]);
    expect(ranked.map((c) => c.name)).toEqual(['Lahore', 'Karachi']);
  });

  it('skips hostels with no city', () => {
    expect(
      rankCities([at(''), at('  '), at('Bangkok')]).map((c) => c.name),
    ).toEqual(['Bangkok']);
  });

  it('centres the search on the mean of the hostels that have a position', () => {
    const [city] = rankCities([
      at('Berlin', 52.5, 13.4),
      at('Berlin', 52.6, 13.2),
      at('Berlin'),
    ]);
    expect(city.query).toEqual({ place: 'Berlin', lat: 52.55, lng: 13.3 });
  });
});

describe('cityLink', () => {
  it('sends a city with a landing page to it, as before', () => {
    expect(cityLink('Lahore', { lat: 31.5, lng: 74.3 })).toEqual({
      name: 'Lahore',
      link: ['/hostels', 'lahore'],
      query: null,
    });
  });

  it('sends any other city to a search centred on it', () => {
    expect(cityLink('Kuala Lumpur', { lat: 3.139, lng: 101.6869 })).toEqual({
      name: 'Kuala Lumpur',
      link: ['/search', 'kuala-lumpur'],
      query: { place: 'Kuala Lumpur', lat: 3.139, lng: 101.6869 },
    });
  });
});

describe('PopularCities', () => {
  const BOX = { north: 55, south: 47, east: 15, west: 6 };

  function setUp(opts: {
    platform?: string;
    home?: { code: string; box: typeof BOX } | null;
    list?: () => unknown;
    busy?: ReturnType<typeof signal<boolean>>;
  }) {
    const list = vi.fn(
      opts.list ??
        (() => of({ items: [at('Berlin'), at('Munich'), at('Berlin')] })),
    );
    TestBed.configureTestingModule({
      providers: [
        { provide: PLATFORM_ID, useValue: opts.platform ?? 'browser' },
        {
          provide: CountryBounds,
          useValue: {
            forVisitor: () =>
              Promise.resolve(
                opts.home === undefined ? { code: 'DE', box: BOX } : opts.home,
              ),
          },
        },
        { provide: ListingsApi, useValue: { list } },
        {
          provide: StartupGate,
          useValue: { busy: opts.busy ?? signal(false) },
        },
      ],
    });
    return { service: TestBed.inject(PopularCities), list };
  }

  it('waits for startup, and the country lookup with it, before asking', async () => {
    const busy = signal(true);
    const { service, list } = setUp({ busy });
    const cities = firstValueFrom(service.forVisitor());
    TestBed.tick();
    await Promise.resolve();
    expect(list).not.toHaveBeenCalled();

    busy.set(false);
    TestBed.tick();
    expect((await cities)?.map((c) => c.name)).toEqual(['Berlin', 'Munich']);
  });

  it("ranks the hostels inside the visitor's country", async () => {
    const { service, list } = setUp({});
    const cities = await firstValueFrom(service.forVisitor());
    expect(list).toHaveBeenCalledWith({ bounds: BOX, pageSize: 100 });
    expect(cities?.map((c) => c.name)).toEqual(['Berlin', 'Munich']);
  });

  it('gives no list when the country is not known', async () => {
    const { service, list } = setUp({ home: null });
    expect(await firstValueFrom(service.forVisitor())).toBeNull();
    expect(list).not.toHaveBeenCalled();
  });

  it('gives no list for a country with nothing listed', async () => {
    const { service } = setUp({ list: () => of({ items: [] }) });
    expect(await firstValueFrom(service.forVisitor())).toBeNull();
  });

  it('gives no list when the search fails', async () => {
    const { service } = setUp({
      list: () => throwError(() => new Error('offline')),
    });
    expect(await firstValueFrom(service.forVisitor())).toBeNull();
  });

  it('asks nothing on the server', async () => {
    const { service, list } = setUp({ platform: 'server' });
    expect(await firstValueFrom(service.forVisitor())).toBeNull();
    expect(list).not.toHaveBeenCalled();
  });
});
