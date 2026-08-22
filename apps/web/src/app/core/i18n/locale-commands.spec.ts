import { localiseCommands } from './locale-commands';

describe('localiseCommands', () => {
  it('prefixes an absolute path', () => {
    expect(localiseCommands('/hostels/lahore', 'de')).toBe('/de/hostels/lahore');
  });

  it('prefixes the leading segment of a commands array, keeping the rest', () => {
    expect(localiseCommands(['/search', 'lahore'], 'de')).toEqual(['/de/search', 'lahore']);
  });

  it('keeps the query string attached to the prefixed path', () => {
    expect(localiseCommands('/auth?returnUrl=/notifications', 'ur')).toBe(
      '/ur/auth?returnUrl=/notifications',
    );
  });

  it('turns the root into the bare prefix rather than a trailing slash', () => {
    expect(localiseCommands('/', 'ar')).toBe('/ar');
  });

  // English is not a special case: it gets its code like every other language.
  it('prefixes the default locale too', () => {
    expect(localiseCommands('/hostels/lahore', 'en')).toBe('/en/hostels/lahore');
    expect(localiseCommands(['/search', 'lahore'], 'en')).toEqual(['/en/search', 'lahore']);
  });

  // Relative links resolve against the current route, which already carries the prefix.
  it('leaves relative links alone', () => {
    expect(localiseCommands('hostels/lahore', 'de')).toBe('hostels/lahore');
    expect(localiseCommands(['../rooms'], 'de')).toEqual(['../rooms']);
  });

  // The guard and the directive can both act on the same target; applying twice must not
  // produce /de/de/…
  it('is idempotent', () => {
    const once = localiseCommands('/hostels/lahore', 'de');
    expect(localiseCommands(once, 'de')).toBe('/de/hostels/lahore');
    expect(localiseCommands(['/de/search', 'lahore'], 'de')).toEqual(['/de/search', 'lahore']);
  });

  it('leaves a path already carrying a different language alone', () => {
    expect(localiseCommands('/ur/hostels/lahore', 'de')).toBe('/ur/hostels/lahore');
    // Including English, which is now a prefix and not the absence of one.
    expect(localiseCommands('/en/hostels/lahore', 'de')).toBe('/en/hostels/lahore');
  });

  it('passes null and undefined through', () => {
    expect(localiseCommands(null, 'de')).toBeNull();
    expect(localiseCommands(undefined, 'de')).toBeUndefined();
  });

  // A protocol-relative URL is not ours to rewrite.
  it('leaves protocol-relative URLs alone', () => {
    expect(localiseCommands('//example.com/x', 'de')).toBe('//example.com/x');
  });

  // Commands arrays can carry a param object or a non-string head; neither is a path.
  it('leaves an array with a non-string head alone', () => {
    const commands = [{ outlets: { primary: 'x' } }];
    expect(localiseCommands(commands, 'de')).toEqual(commands);
  });
});
