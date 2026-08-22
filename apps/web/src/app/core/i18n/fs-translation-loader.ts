import { Injectable } from '@angular/core';
import { Translation, TranslocoLoader } from '@jsverse/transloco';
import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Reads `public/i18n/<lang>.json` off disk. **Server only.**
 *
 * The browser loader fetches `/i18n/<lang>.json`, which is a relative URL and therefore
 * meaningless during SSR — there is no page origin to resolve it against, so the request
 * fails and every string falls back to English. The server-rendered HTML would then be
 * English with a `lang="ur"` attribute on it: worse than untranslated, because a crawler
 * would index English under an Urdu URL.
 *
 * Reading the file directly avoids the server making an HTTP request to itself, which
 * would deadlock a single-threaded server rendering its own page.
 */
@Injectable()
export class FsTranslationLoader implements TranslocoLoader {
  /**
   * Where the JSON might be, most specific first.
   *
   * A built server bundle sits in `dist/apps/web/server/`, so the assets are the sibling
   * `browser/i18n`. Under `ng serve` there is no such sibling: this module resolves inside
   * `.angular/vite-root/`, a path that never exists on disk because Vite serves `public/`
   * from memory. That made every dev SSR render throw ENOENT and fall back to English —
   * silently defeating the whole point of this loader precisely where translations are
   * being worked on.
   */
  private readonly roots = [
    join(dirname(fileURLToPath(import.meta.url)), '../browser/i18n'),
    join(process.cwd(), 'apps/web/public/i18n'),
  ];

  async getTranslation(lang: string): Promise<Translation> {
    for (const root of this.roots) {
      try {
        return JSON.parse(await readFile(join(root, `${lang}.json`), 'utf8')) as Translation;
      } catch (err) {
        // Only a missing file is worth trying the next root for. A malformed JSON file is a
        // real error and must surface here rather than be reported as "not found".
        if ((err as NodeJS.ErrnoException)?.code !== 'ENOENT') throw err;
      }
    }
    throw new Error(
      `Missing translation file "${lang}.json". Looked in: ${this.roots.join(', ')}`,
    );
  }
}
