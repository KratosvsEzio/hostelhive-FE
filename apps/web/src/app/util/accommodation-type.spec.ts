import { at, loadLocale, localeFiles } from '@core/i18n/locale-files-testing';
import { ACCOMMODATION_LABEL_KEYS, ACCOMMODATION_LABELS, accommodationLabelKey } from './accommodation-type';

/**
 * The accommodation-type pill on search cards, the map card and the host switcher renders
 * these keys. It once showed "Boys" / "Girls" on `/ur` and `/ar` because the cards read the
 * English-only {@link ACCOMMODATION_LABELS} table.
 */
describe('accommodationLabelKey', () => {
  it('maps every accommodation type to its common.* key', () => {
    for (const type of Object.keys(ACCOMMODATION_LABELS)) {
      expect(accommodationLabelKey(type)).toBe(
        ACCOMMODATION_LABEL_KEYS[type as keyof typeof ACCOMMODATION_LABEL_KEYS],
      );
    }
  });

  it('falls back to the raw value for a type it does not know', () => {
    expect(accommodationLabelKey('mixed')).toBe('mixed');
  });

  it.each(localeFiles())('has every accommodation key as text in %s', (file) => {
    const tree = loadLocale(file);
    for (const key of Object.values(ACCOMMODATION_LABEL_KEYS)) {
      expect(typeof at(tree, key), `${file} ${key}`).toBe('string');
    }
  });

  it.each(['ur.json', 'ar.json'])('reads the pill in its own script in %s, not English', (file) => {
    const tree = loadLocale(file);
    for (const [type, key] of Object.entries(ACCOMMODATION_LABEL_KEYS)) {
      expect(at(tree, key)).not.toBe(ACCOMMODATION_LABELS[type as keyof typeof ACCOMMODATION_LABELS]);
    }
  });
});
