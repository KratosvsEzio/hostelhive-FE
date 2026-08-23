import { photonSearch } from './photon';

/**
 * Captures the URL {@link photonSearch} builds, so the query it sends can be asserted
 * without a network call. Photon's response shape is not what these tests are about.
 */
function captureUrl(): { calls: string[] } {
  const calls: string[] = [];
  vi.stubGlobal('fetch', (url: string) => {
    calls.push(url);
    return Promise.resolve({
      ok: true,
      json: () => Promise.resolve({ features: [] }),
    } as Response);
  });
  return { calls };
}

describe('photonSearch', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('searches worldwide — no country or bounding-box filter', async () => {
    const { calls } = captureUrl();
    await photonSearch('amsterdam');

    // The listings are not necessarily in the visitor's country, so neither restriction
    // may come back: each one hides the results from somebody.
    expect(calls[0]).not.toContain('bbox');
    expect(calls[0]).not.toContain('countrycodes');
  });

  it('ranks around the visitor when a bias is given', async () => {
    const { calls } = captureUrl();
    await photonSearch('central', { bias: { lat: 52.0958, lng: 5.3231 } });

    expect(calls[0]).toContain('lat=52.0958');
    expect(calls[0]).toContain('lon=5.3231');
    expect(calls[0]).toContain('location_bias_scale=');
  });

  it('sends no bias when there is none to send', async () => {
    const { calls } = captureUrl();
    await photonSearch('central', { bias: null });

    // A visitor whose country never resolved gets unranked results rather than results
    // ranked around 0,0 — which is in the Atlantic.
    expect(calls[0]).not.toContain('lat=');
    expect(calls[0]).not.toContain('location_bias_scale=');
  });

  it('restricts to settlements only when asked', async () => {
    const { calls } = captureUrl();
    await photonSearch('lahore', { placesOnly: true });
    await photonSearch('lahore');

    expect(calls[0]).toContain('osm_tag=place');
    expect(calls[1]).not.toContain('osm_tag');
  });
});
