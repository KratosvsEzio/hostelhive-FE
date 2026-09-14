import { pagePath, shouldResetScroll } from './scroll-reset';

describe('pagePath', () => {
  it('keeps the path and drops the query', () => {
    expect(pagePath('/en/search?city=lahore&page=2')).toBe('/en/search');
  });

  it('drops a fragment', () => {
    expect(pagePath('/en/hostel/EsTpOs#rooms')).toBe('/en/hostel/EsTpOs');
  });

  it('leaves a bare path alone', () => {
    expect(pagePath('/en/blog')).toBe('/en/blog');
  });
});

describe('shouldResetScroll', () => {
  it('resets when the path changes', () => {
    expect(shouldResetScroll('/en/search', '/en/blog', 'imperative')).toBe(true);
  });

  /**
   * The reason this is hand-rolled rather than `withInMemoryScrolling`. The search page
   * publishes filters and map bounds as query parameters, so every checkbox and every map
   * pan is a navigation. Resetting on those would throw the reader back to the top of the
   * results they were reading.
   */
  it('does NOT reset when only the query changes', () => {
    expect(
      shouldResetScroll(
        '/en/search?gender=boys',
        '/en/search?gender=girls&page=3',
        'imperative',
      ),
    ).toBe(false);
  });

  it('does NOT reset on Back or Forward, whatever the path', () => {
    expect(shouldResetScroll('/en/blog', '/en/search', 'popstate')).toBe(false);
  });

  it('resets when the path changes and the query changes with it', () => {
    expect(
      shouldResetScroll('/en/search?city=lahore', '/en/blog?ref=footer', 'imperative'),
    ).toBe(true);
  });

  it('does not reset when nothing changed at all', () => {
    expect(shouldResetScroll('/en/blog', '/en/blog', 'imperative')).toBe(false);
  });
});
