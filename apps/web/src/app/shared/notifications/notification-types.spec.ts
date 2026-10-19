import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { KNOWN_NOTIFICATION_TYPES, notificationTypeStyle } from './notification-types';

const here = dirname(fileURLToPath(import.meta.url));
const read = (relative: string) => readFileSync(join(here, relative), 'utf8');

describe('notificationTypeStyle', () => {
  it.each([
    [
      'meal_confirmation',
      'ti-tools-kitchen-2',
      'notifications.types.mealConfirmation',
      'Meal Confirmation',
      'bg-emerald-50 text-emerald-600',
      'text-emerald-600',
    ],
    [
      'rent',
      'ti-cash',
      'notifications.types.rent',
      'Rent',
      'bg-amber-50 text-amber-600',
      'text-amber-600',
    ],
    [
      'receipt',
      'ti-receipt',
      'notifications.types.receipt',
      'Receipt',
      'bg-blue-50 text-blue-600',
      'text-blue-600',
    ],
  ])(
    "keeps today's look for %s, with a translated name",
    (type, icon, labelKey, fallbackLabel, bg, text) => {
      expect(notificationTypeStyle(type)).toEqual({ icon, labelKey, fallbackLabel, bg, text });
    },
  );

  it('shows a declined card with a card icon and a danger tint', () => {
    expect(notificationTypeStyle('card_declined')).toEqual({
      icon: 'ti-credit-card',
      labelKey: 'notifications.types.cardDeclined',
      fallbackLabel: 'Card Declined',
      bg: 'bg-danger/10 text-danger',
      text: 'text-danger',
    });
  });

  it('shows an expiring card with a card icon and a warn tint', () => {
    expect(notificationTypeStyle('card_expiring')).toEqual({
      icon: 'ti-credit-card',
      labelKey: 'notifications.types.cardExpiring',
      fallbackLabel: 'Card Expiring',
      bg: 'bg-warn/10 text-warn',
      text: 'text-warn',
    });
  });

  it('falls back to a bell and the type title-cased, with nothing to translate, for an unknown type', () => {
    expect(notificationTypeStyle('hostel_invite')).toEqual({
      icon: 'ti-bell',
      labelKey: null,
      fallbackLabel: 'Hostel Invite',
      bg: 'bg-ink-50 text-ink-600',
      text: 'text-ink-500',
    });
  });

  it('gives every known type a key under notifications.types', () => {
    expect(KNOWN_NOTIFICATION_TYPES.length).toBeGreaterThan(0);
    for (const type of KNOWN_NOTIFICATION_TYPES) {
      expect(notificationTypeStyle(type).labelKey?.startsWith('notifications.types.')).toBe(true);
    }
  });

  it('does not treat inherited object keys as types', () => {
    expect(notificationTypeStyle('constructor').icon).toBe('ti-bell');
    expect(notificationTypeStyle('constructor').labelKey).toBeNull();
    // Title-casing splits on underscores only, as the pages always did.
    expect(notificationTypeStyle('toString').fallbackLabel).toBe('ToString');
  });

  it('is the map both the page and the bell read', () => {
    for (const path of [
      '../../features/notifications/notifications.ts',
      '../../layout/components/notification-bell/notification-bell.ts',
    ]) {
      const source = read(path);
      expect(source).toContain('notificationTypeStyle');
      expect(source).not.toContain("case 'meal_confirmation'");
    }
  });
});
