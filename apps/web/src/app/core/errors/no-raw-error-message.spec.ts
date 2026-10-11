import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Keeps an error's `message` off the screen in feature code.
 *
 * `ApiError.message` can be Angular's "Http failure response for <url>", and a plain `Error`
 * carries developer text, so neither is display copy. Screens classify by status and show a
 * translated key instead (see `api-error-text.ts`). This scans the source rather than the
 * screens, so a new read fails here before anybody has to find it on a page.
 *
 * The scan is deliberately wide: any `.message` read, any `['message']`, and any `{ message }`
 * destructured from a value rather than from a call such as `toToastCopy(err)`. Reads that are
 * genuinely not an error's text are listed in `ALLOWED`, with exactly how many each file holds.
 */

/** `apps/web/src/app/features` — two levels up from here: errors, core. */
const FEATURES_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'features');

const MESSAGE_READS: readonly RegExp[] = [
  /[\w$)\]][?!]?\.message\b/g,
  /\[\s*['"`]message['"`]\s*\]/g,
  /\{[^{}]*\bmessage\b[^{}]*\}\s*(?:=\s*[\w$]+(?:[?!]?\.[\w$]+)*\s*(?:[;,)]|$)|(?::\s*[\w$<>[\]|. ]+)?\)\s*=>)/g,
];

/** Every `.message` read the patterns find in one line of source. */
function messageReads(line: string): string[] {
  return MESSAGE_READS.flatMap((pattern) => [...line.matchAll(pattern)].map((m) => m[0]));
}

/** Known reads, by path under `features/`, with exactly how many each holds. */
const ALLOWED: Readonly<Record<string, number>> = {
  // Raw `err?.message`, left to the stay-flow work that owns these files; still to be fixed.
  'host/bookings/booking-details-panel.ts': 1,
  'host/bookings/bookings.ts': 1,
  // Billing shows a 422's own `serverMessages[0]` by product rule; `e` is the page's error view.
  'host/subscription/billing-page.html': 3,
  // `outcome.message` / `note.message` / `view.message` are copy the billing code builds itself.
  'host/subscription/payment-return-retry.ts': 3,
  'host/subscription/payment-return-states.ts': 2,
  'host/subscription/payment-step.ts': 1,
  // `invite.message` is the note an inviter wrote, not an error.
  'notifications/notifications.html': 1,
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

/** Every read in the features tree, as `path:line: text`, grouped by path under `features/`. */
function rawMessageReads(): Map<string, string[]> {
  const found = new Map<string, string[]>();
  for (const file of sourceFiles(FEATURES_DIR)) {
    const path = relative(FEATURES_DIR, file).split(sep).join('/');
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

describe('feature code never reads a message for display', () => {
  const found = rawMessageReads();

  it('finds the feature source to scan', () => {
    expect(sourceFiles(FEATURES_DIR).length).toBeGreaterThan(0);
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
