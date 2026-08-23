import { Injectable, PendingTasks, inject } from '@angular/core';
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

  /**
   * SSR serializes the page once Angular reports no work outstanding. It learns about
   * outstanding work from `PendingTasks` — which `HttpClient` reports into, and a bare
   * `readFile` promise does not. Without this wrapper the server rendered every
   * translated binding as an empty string, and `provideClientHydration` then reused that
   * empty DOM rather than re-rendering it, so a cold load showed blank labels until
   * something (a language switch) forced a re-render.
   */
  private readonly pending = inject(PendingTasks);

  getTranslation(lang: string): Promise<Translation> {
    const read = this.read(lang);
    // `run` returns void, so hand it a copy to await and give the caller the real promise.
    // The copy swallows the rejection so a missing file surfaces once — to Transloco —
    // rather than also as an unhandled rejection that would take the server down.
    this.pending.run(() => read.catch(() => undefined));
    return read;
  }

  private async read(lang: string): Promise<Translation> {
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
