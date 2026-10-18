import { MockInstance, vi } from 'vitest';

/** What a page wrote into a window it opened, and what it did with it. */
export interface PrintWindowRecord {
  /** Everything passed to `document.write`, concatenated in order. */
  html(): string;
  /** The window's `document.title` as the page left it. */
  title(): string;
  /** `window.open`, spied; its calls carry the URL, target and features. */
  readonly open: MockInstance<typeof window.open>;
  readonly print: ReturnType<typeof vi.fn>;
  readonly close: ReturnType<typeof vi.fn>;
  /** Fires the window's `onload`, which is where a print page calls `print()`. */
  load(): void;
  /** Puts the real `window.open` back. */
  restore(): void;
}

/**
 * Replaces `window.open` with one returning a fake window that records `document.write`.
 *
 * The print path writes raw HTML into a new window, outside Angular's sanitiser, so the written
 * string is the thing to assert on. Pass `blocked: true` for a popup blocker (`open` returns null).
 */
export function fakePrintWindow(opts: { blocked?: boolean } = {}): PrintWindowRecord {
  const written: string[] = [];
  const print = vi.fn();
  const close = vi.fn();
  const fake = {
    document: {
      title: '',
      write: (html: string) => written.push(html),
      close: vi.fn(),
    },
    focus: vi.fn(),
    print,
    close,
    onload: null as (() => void) | null,
    onafterprint: null as (() => void) | null,
  };
  const open = vi
    .spyOn(window, 'open')
    .mockImplementation(() => (opts.blocked ? null : (fake as unknown as Window)));
  return {
    html: () => written.join(''),
    title: () => fake.document.title,
    open,
    print,
    close,
    load: () => fake.onload?.(),
    restore: () => open.mockRestore(),
  };
}
