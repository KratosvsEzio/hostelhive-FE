import {
  boundaryMetadataUrl,
  corsReadableUrl,
  fetchCountryBoundaries,
} from './country-boundaries';

const RAW =
  'https://github.com/wmgeolab/geoBoundaries/raw/9469f09/releaseData/gbOpen/DEU/ADM1/geoBoundaries-DEU-ADM1_simplified.geojson';
const MEDIA =
  'https://media.githubusercontent.com/media/wmgeolab/geoBoundaries/9469f09/releaseData/gbOpen/DEU/ADM1/geoBoundaries-DEU-ADM1_simplified.geojson';

const COLLECTION = {
  type: 'FeatureCollection',
  features: [
    { type: 'Feature', properties: { shapeName: 'Bayern' }, geometry: null },
  ],
};

describe('country boundaries', () => {
  const realFetch = globalThis.fetch;
  let asked: string[];

  function serve(
    answers: Record<string, { status?: number; body: unknown }>,
  ): void {
    asked = [];
    globalThis.fetch = ((input: RequestInfo | URL) => {
      const url = String(input);
      asked.push(url);
      const answer = answers[url] ?? { status: 404, body: {} };
      const status = answer.status ?? 200;
      return Promise.resolve({
        ok: status < 400,
        status,
        json: () => Promise.resolve(answer.body),
      } as Response);
    }) as typeof fetch;
  }

  afterEach(() => {
    globalThis.fetch = realFetch;
  });

  it('asks for the first-level divisions by alpha-3', () => {
    expect(boundaryMetadataUrl('deu')).toBe(
      'https://www.geoboundaries.org/api/current/gbOpen/DEU/ADM1/',
    );
  });

  // github.com/raw redirects with an empty CORS header, which a browser refuses to follow.
  it('reads GitHub raw links from the CORS-enabled media host', () => {
    expect(corsReadableUrl(RAW)).toBe(MEDIA);
  });

  it('leaves any other address alone', () => {
    expect(corsReadableUrl('https://example.org/a.geojson')).toBe(
      'https://example.org/a.geojson',
    );
  });

  it('follows the metadata record to the simplified file', async () => {
    serve({
      [boundaryMetadataUrl('DEU')]: {
        body: { simplifiedGeometryGeoJSON: RAW },
      },
      [MEDIA]: { body: COLLECTION },
    });

    const fc = await fetchCountryBoundaries('DEU');

    expect(fc.features).toHaveLength(1);
    expect(asked).toEqual([boundaryMetadataUrl('DEU'), MEDIA]);
  });

  it('rejects a country geoBoundaries does not cover', async () => {
    serve({});

    await expect(fetchCountryBoundaries('VAT')).rejects.toThrow();
  });

  it('rejects a file that is not a usable FeatureCollection', async () => {
    serve({
      [boundaryMetadataUrl('DEU')]: {
        body: { simplifiedGeometryGeoJSON: RAW },
      },
      [MEDIA]: { body: { type: 'FeatureCollection', features: [] } },
    });

    await expect(fetchCountryBoundaries('DEU')).rejects.toThrow();
  });
});
