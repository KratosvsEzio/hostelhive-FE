import { at, loadLocale, localeFiles, params } from './locale-files-testing';

/**
 * Count strings and their singulars, in every language. The app has no plural rules, so a
 * template picks the `…One` key when the count is one and the plain key otherwise.
 */
const PAIRS = [
  'common.nBeds',
  'common.nGuests',
  'hostBookings.checkInNGuests',
  'hostBookings.forNNights',
  'hostBookings.nPrivateRooms',
  'hostBookings.nRooms',
  'hostBookings.nSharedBeds',
  'hostBookings.placeNGuests',
  'hostMess.maxNHoursWindow',
  'hostOverview.nTenantsUnpaid',
  'hostRooms.createNRooms',
];
const KEYS = PAIRS.flatMap((key) => [key, `${key}One`]);

const files = localeFiles();

function text(file: string, path: string): string | undefined {
  const node = at(loadLocale(file), path);
  return typeof node === 'string' ? node : undefined;
}

describe('the singular count strings in every language', () => {
  it('covers all 18 languages', () => {
    expect(files).toHaveLength(18);
  });

  it.each(files)('%s holds every key as non-empty text with a {{count}}', (file) => {
    const bad = KEYS.filter((path) => {
      const value = text(file, path);
      return !value?.trim() || params(value).join(',') !== 'count';
    });
    expect(bad).toEqual([]);
  });

  it('words the English singulars without a plural noun', () => {
    expect(text('en.json', 'common.nBedsOne')).toBe('{{count}} bed');
    expect(text('en.json', 'common.nGuestsOne')).toBe('{{count}} guest');
    expect(text('en.json', 'hostMess.maxNHoursWindowOne')).toBe(
      'Max {{count}} hour — window cannot extend past meal time.',
    );
    expect(text('en.json', 'hostOverview.nTenantsUnpaidOne')).toBe('{{count}} tenant unpaid');
    expect(text('en.json', 'hostRooms.createNRoomsOne')).toBe('Create {{count}} room');
  });
});
