import {
  KNOWN_NOTIFICATION_TYPES,
  notificationTypeStyle,
} from '@app/shared/notifications/notification-types';
import { at, loadLocale, localeFiles } from './locale-files-testing';

/**
 * The name of each notification type, shown above every notification on the page and in the
 * bell. Read from the type map itself, so a new type can't ship with an English-only name
 * (Trello #214).
 */
const KEYS = KNOWN_NOTIFICATION_TYPES.map((type) => {
  const key = notificationTypeStyle(type).labelKey;
  if (!key) throw new Error(`${type} has no label key`);
  return key;
});

const files = localeFiles();
const en = loadLocale('en.json');

describe('the notification type names in every language', () => {
  it('covers all 18 languages and every known type', () => {
    expect(files).toHaveLength(18);
    expect(KEYS).toEqual([
      'notifications.types.mealConfirmation',
      'notifications.types.rent',
      'notifications.types.receipt',
      'notifications.types.cardDeclined',
      'notifications.types.cardExpiring',
    ]);
  });

  it.each(KEYS)('English names %s', (path) => {
    const text = at(en, path);
    expect(typeof text, path).toBe('string');
    expect((text as string).trim(), path).not.toBe('');
  });

  describe.each(files.filter((f) => f !== 'en.json'))('%s', (file) => {
    const tree = loadLocale(file);

    it.each(KEYS)('translates %s', (path) => {
      const text = at(tree, path);
      expect(typeof text, path).toBe('string');
      expect((text as string).trim(), path).not.toBe('');
      expect(text, path).not.toBe(at(en, path));
    });
  });
});
