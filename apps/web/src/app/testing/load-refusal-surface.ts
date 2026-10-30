import { REFUSAL_KINDS, RefusalKind } from './backend-refusals';

/** What a host list page renders in place of its content when its load fails. */
export type LoadSurface = 'permission' | 'error' | 'network';

/**
 * The surface each refusal must leave on a host list page's load: the permission panel for a
 * permission 403, the generic error (with Retry) for anything else the server answered, and the
 * connection error when it never answered. A plan refusal (no live plan, a 402, no CRM) reads as
 * generic here: the console's plan lock owns it and replaces the page, so the page never says it.
 */
export const LIST_LOAD_REFUSALS: Readonly<Record<RefusalKind, LoadSurface>> = {
  permissionCanCan: 'permission',
  permissionRender403: 'permission',
  crmRequired: 'error',
  crmMessageOnly: 'error',
  inactive: 'error',
  paymentRequired: 'error',
  rateLimited: 'error',
  notFound: 'error',
  unprocessable: 'error',
  serverError: 'error',
  network: 'network',
};

/** The plan refusals: the console's lock owns them, so a list page shows only its generic error. */
export const PLAN_REFUSALS: readonly RefusalKind[] = ['crmRequired', 'crmMessageOnly', 'inactive', 'paymentRequired'];

/** The kinds that must leave `surface` on a list page, in {@link REFUSAL_KINDS} order. */
export function kindsShowing(surface: LoadSurface): RefusalKind[] {
  return REFUSAL_KINDS.filter((kind) => LIST_LOAD_REFUSALS[kind] === surface);
}

/** What {@link loadSurface} read off a page. */
export interface LoadSurfaceReading {
  /** Every surface rendered, in document order: `[]` for the page's content, two or more is a defect. */
  surfaces: LoadSurface[];
  /** The surface when exactly one is rendered, otherwise null. */
  surface: LoadSurface | null;
  /** The sole surface's heading, whitespace collapsed; null without exactly one surface. */
  heading: string | null;
  /** The sole surface's first paragraph, whitespace collapsed; null when it has none. */
  body: string | null;
  /** Whether any error state renders its Retry button, the permission panel's own included. */
  retry: boolean;
  /** All of `el`'s text, whitespace collapsed. */
  text: string;
}

const PANEL = 'hh-permission-refused';
const ERROR_STATE = 'hh-error-state';
/** `ErrorState`'s icon when `networkError` is set; the generic variant shows `ti-alert-triangle`. */
const OFFLINE_ICON = '.ti-wifi-off';

/**
 * Reads which load surface `el` renders, from the real elements: `<hh-permission-refused>`,
 * and any `<hh-error-state>` outside the panel, which is `'network'` when
 * it shows the offline icon: that stays whatever title or message a page passes, unlike the text.
 * An error state a section renders inside loaded content counts too.
 *
 * With key-echo i18n, `hostAccess.pageNotAllowed` is a prefix of `hostAccess.pageNotAllowedOwner`,
 * so tell the two role sentences apart by `body`, not by `text` containing one.
 */
export function loadSurface(el: HTMLElement): LoadSurfaceReading {
  const found = Array.from(el.querySelectorAll(`${PANEL}, ${ERROR_STATE}`)).filter(
    (node) => !node.parentElement?.closest(PANEL),
  );
  const sole = found.length === 1 ? found[0] : null;
  return {
    surfaces: found.map(surfaceOf),
    surface: sole ? surfaceOf(sole) : null,
    heading: sole ? textOf(sole.querySelector('h1, h2')) : null,
    body: sole ? textOf(sole.querySelector('p')) : null,
    retry: el.querySelector(`${ERROR_STATE} button`) !== null,
    text: textOf(el) ?? '',
  };
}

function surfaceOf(node: Element): LoadSurface {
  const tag = node.tagName.toLowerCase();
  if (tag === PANEL) return 'permission';
  return node.querySelector(OFFLINE_ICON) ? 'network' : 'error';
}

function textOf(node: Element | null): string | null {
  return node ? (node.textContent ?? '').replace(/\s+/g, ' ').trim() : null;
}
