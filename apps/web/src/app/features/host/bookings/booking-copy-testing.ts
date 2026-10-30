import { Injectable, Provider } from '@angular/core';
import { TRANSLOCO_MISSING_HANDLER, TranslocoMissingHandler } from '@jsverse/transloco';
import { at, loadLocale } from '@core/i18n/locale-files-testing';
import { BookingCopy } from './booking-copy';

/**
 * A {@link BookingCopy} that reads the shipped `en.json` — for specs only.
 *
 * Copy built in code (filter and column configs) is checked as the English a host reads,
 * so a key that does not exist fails as loudly as a wrong word.
 */
export function englishCopy(): BookingCopy {
  const en = loadLocale('en.json');
  return (key, params = {}) => {
    const text = at(en, key);
    if (typeof text !== 'string') throw new Error(`no English for ${key}`);
    return text.replace(/\{\{\s*(\w+)\s*\}\}/g, (_, name: string) => String(params[name]));
  };
}

/**
 * Renders a key with its params — `common.roomNumber(number=101)` — where `provideI18nTesting`
 * renders the bare key.
 *
 * The booking screens put counts and room numbers into their copy, and a bare key would draw
 * "Room 101 · 2 guests" and "Room 102 · 1 guest" as the same text. Add after
 * `provideI18nTesting()`.
 */
@Injectable()
class KeyWithParams implements TranslocoMissingHandler {
  handle(key: string, _data: unknown, params?: Record<string, unknown>): string {
    const shown = Object.entries(params ?? {}).map(([name, value]) => `${name}=${value}`);
    return shown.length ? `${key}(${shown.join(', ')})` : key;
  }
}

export function provideKeysWithParams(): Provider {
  return { provide: TRANSLOCO_MISSING_HANDLER, useClass: KeyWithParams };
}
