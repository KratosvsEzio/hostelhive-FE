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
  /** `dist/apps/web/server/` → the sibling `browser/` folder the assets are copied into. */
  private readonly assets = join(
    dirname(fileURLToPath(import.meta.url)),
    '../browser/i18n',
  );

  async getTranslation(lang: string): Promise<Translation> {
    const raw = await readFile(join(this.assets, `${lang}.json`), 'utf8');
    return JSON.parse(raw) as Translation;
  }
}
