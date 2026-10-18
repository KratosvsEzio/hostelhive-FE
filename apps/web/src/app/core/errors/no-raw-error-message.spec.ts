import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Keeps an error's `message` off the screen in feature, layout and shared code.
 *
 * `ApiError.message` is a diagnostic ("GET /api/x → 404"), and a plain `Error` carries developer
 * text, so neither is display copy. Screens classify by status and show a
 * translated key instead (see `api-error-text.ts`). This scans the source rather than the
 * screens, so a new read fails here before anybody has to find it on a page.
 *
 * The scan is deliberately wide: any `.message` read, any `['message']`, and any `{ message }`
 * destructured from a value rather than from a call such as `toToastCopy(err)`. Reads that are
 * genuinely not an error's text are listed in `ALLOWED`, with exactly how many each file holds.
 */

/** `apps/web/src/app` — two levels up from here: errors, core. */
const APP_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

/** The trees that render to a screen; `core/`, `services/` and `util/` hold no templates. */
const SCANNED_DIRS: readonly string[] = ['features', 'layout', 'shared'].map((dir) => join(APP_DIR, dir));

const MESSAGE_READS: readonly RegExp[] = [
  /[\w$)\]][?!]?\.message\b/g,
  /\[\s*['"`]message['"`]\s*\]/g,
  /\{[^{}]*\bmessage\b[^{}]*\}\s*(?:=\s*[\w$]+(?:[?!]?\.[\w$]+)*\s*(?:[;,)]|$)|(?::\s*[\w$<>[\]|. ]+)?\)\s*=>)/g,
];

/** Every `.message` read the patterns find in one line of source. */
function messageReads(line: string): string[] {
  return MESSAGE_READS.flatMap((pattern) => [...line.matchAll(pattern)].map((m) => m[0]));
}

/** Known reads, by path under `apps/web/src/app/`, with exactly how many each holds. */
const ALLOWED: Readonly<Record<string, number>> = {
  // Billing shows a 422's own `serverMessages[0]` by product rule; `e` is the page's error view.
  'features/host/subscription/billing-page.html': 3,
  // `outcome.message` / `note.message` / `view.message` are copy the billing code builds itself.
  'features/host/subscription/payment-return-retry.ts': 3,
  'features/host/subscription/payment-return-states.ts': 2,
  'features/host/subscription/payment-step.ts': 1,
  // `invite.message` is the note an inviter wrote, not an error.
  'features/notifications/notifications.html': 1,
  'layout/components/notification-bell/notification-bell.html': 1,
  // `t.message` is the toast's own body: display copy its caller built, not an error's text.
  'layout/components/toast-host/toast-host.html': 2,
};

/** Every non-spec TypeScript file and template under `dir`, as absolute paths. */
function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) return sourceFiles(full);
    const scanned =
      (entry.name.endsWith('.ts') && !entry.name.endsWith('.spec.ts')) ||
      entry.name.endsWith('.html');
    return scanned ? [full] : [];
  });
}

/** Every read in the scanned trees, as `path:line: text`, grouped by path under `app/`. */
function rawMessageReads(): Map<string, string[]> {
  const found = new Map<string, string[]>();
  for (const file of SCANNED_DIRS.flatMap((dir) => sourceFiles(dir))) {
    const path = relative(APP_DIR, file).split(sep).join('/');
    readFileSync(file, 'utf8')
      .split(/\r?\n/)
      .forEach((line, index) => {
        for (const read of messageReads(line)) {
          found.set(path, [...(found.get(path) ?? []), `${path}:${index + 1}: ${read}`]);
        }
      });
  }
  return found;
}

describe('the message-read matcher', () => {
  it.each([
    'this.error.set(err.message);',
    'this.error.set(err?.message || fallback);',
    'notify(e.message);',
    'show(error!.message);',
    'show(failure.message);',
    'show((e as Error).message);',
    'show(errors[0].message);',
    "show(err['message']);",
    'show(err?.["message"]);',
    'const { message } = err;',
    'const { status, message } = this.lastError;',
    'error: ({ message }) => this.error.set(message),',
    'error: ({ message }: ApiError) => this.error.set(message),',
    '{{ err.message }}',
    '{{ err?.message }}',
  ])('finds the read in %s', (line) => {
    expect(messageReads(line)).not.toEqual([]);
  });

  it.each([
    'const { title, message } = toToastCopy(err);',
    "return o && 'message' in o ? null : o;",
    '[message]="\'hostRooms.addYourFirstRoomTo\' | transloco"',
    '{{ e.messageKey | transloco }}',
    'this.notifications.show({ kind: \'error\', title, message }, 0);',
  ])('leaves %s alone', (line) => {
    expect(messageReads(line)).toEqual([]);
  });
});

describe('screen code never reads a message for display', () => {
  const found = rawMessageReads();

  it.each(SCANNED_DIRS)('finds source to scan in %s', (dir) => {
    expect(sourceFiles(dir).length).toBeGreaterThan(0);
  });

  it('has no message read beyond what the allowlist names', () => {
    const offending = [...found.entries()]
      .filter(([path, lines]) => lines.length > (ALLOWED[path] ?? 0))
      .flatMap(([, lines]) => lines);
    expect(offending).toEqual([]);
  });

  it('has no stale allowlist entry', () => {
    const stale = Object.entries(ALLOWED)
      .filter(([path, allowed]) => (found.get(path)?.length ?? 0) < allowed)
      .map(([path, allowed]) => {
        const actual = found.get(path)?.length ?? 0;
        return actual === 0
          ? `${path}: no reads left, remove this allowlist entry`
          : `${path}: ${actual} reads left, not ${allowed}; lower this allowlist entry`;
      });
    expect(stale).toEqual([]);
  });
});
