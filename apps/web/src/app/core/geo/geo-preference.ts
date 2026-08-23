import { Injectable, inject } from '@angular/core';
import { NavigationEnd, Router } from '@angular/router';
import { filter, firstValueFrom, take } from 'rxjs';
import { LocaleStore } from '@core/i18n/locale-store';
import { CurrencyPreference } from '@core/preferences/currency-preference';
import { currencyForCountry, localeForCountry } from './country-preferences';
import { StartupGate } from '@core/startup-gate';

/** Where the country came from last time, so a returning visitor costs no request. */
const KEY = 'hh.geo.country';

/**
 * Where the country can be read from. All are asked at once and the first usable answer wins.
 *
 * Both are free, keyless, HTTPS, and send `access-control-allow-origin: *`, which is
 * what makes them callable from the page at all. Each answers with the country for whichever
 * IP asked, so there is nothing to send them — no request body, no data in the URL.
 *
 * There is more than one because a single host is a single point of failure for reasons that
 * have nothing to do with it being down. Dedicated IP-geolocation endpoints sit on tracker
 * blocklists, so ad blockers and privacy-minded VPNs interfere with them — and a VPN is
 * exactly when this lookup matters most.
 *
 * Cloudflare's is first because it is a diagnostic endpoint rather than a geolocation product,
 * which is why it survives filtering that catches the others. Measured on one browser across
 * three VPN states it answered every time and fastest every time (160–310ms); over the same
 * three, `api.country.is` answered twice and `ipwho.is` once.
 *
 * `ipwho.is` and `get.geojs.io` were both tried and dropped — not for being slow hosts (each
 * answers in well under a second when nothing is in the way) but because a filtered request
 * does not fail, it hangs — and a source only earns its place if it answers more often than
 * not. Adding more of them buys redundancy against the wrong failure anyway: they share the
 * same blocklists, so they tend to go down together, and each one is one more request to
 * watch stall.
 */
const SOURCES: readonly { url: string; read: (body: string) => string | null }[] = [
  {
    // Plain `key=value` lines, one of which is `loc=DE`.
    url: 'https://www.cloudflare.com/cdn-cgi/trace',
    read: (body) => normaliseCountry(/(?:^|\n)loc=([A-Za-z]{2})(?:\n|$)/.exec(body)?.[1]),
  },
  {
    url: 'https://api.country.is/',
    read: (body) => readJsonCountry(body, 'country'),
  },
];

/**
 * How long to wait for *any* source before giving up on all of them.
 *
 * There is no per-request timeout, and deliberately so: aborting one is what put a
 * `(canceled)` row in the network tab, and cancelling a request that might still have
 * answered buys nothing once the sources run concurrently. A straggler is simply ignored —
 * it is a GET to a third party with no side effect, so letting the browser finish with it in
 * its own time costs nothing and keeps the tab honest about what actually failed.
 */
const TOTAL_BUDGET_MS = 5000;

/**
 * Opens the app in the language and currency of wherever the visitor is — until they say
 * otherwise.
 *
 * The country decides both **only while neither has been chosen**. Once the visitor picks a
 * language or a currency for themselves, that half stops being guessed at: not on this load,
 * not on any later one, and not when they travel. The two halves are independent, so picking
 * a language leaves the currency still following the country.
 *
 * A URL that names a language counts as an answer too, and the language half stands down
 * for it exactly as it does for a stored choice. Otherwise a German link shared into a
 * group opens in Dutch for whoever happens to tap it from the Netherlands, which makes the
 * link mean something different for each person who receives it. The currency is not
 * affected — a URL says nothing about what someone wants to pay in.
 *
 * Location is a guess about a person, and a guess that overrules them is just a bug with a
 * good excuse. It re-asserted itself on every startup until a visitor's own choice could be
 * told apart from a guess — which is what `hh.locale.chosen` and `hh.currency.chosen` record;
 * the value keys alone cannot, because this class writes those too.
 *
 * A visitor who has chosen nothing is still followed as they move: the country is re-read on
 * every startup and after every `GET /api/users/current`.
 *
 * Deliberately uses `fetch` rather than `HttpClient`: the app's interceptors attach the
 * session bearer token, and this is a third-party host that must never receive it. Going
 * around them also keeps a failure here from raising the app-wide API error toast, which
 * would be a confusing thing to show for a lookup the visitor never asked for.
 *
 * Nothing here blocks startup. Under SSR the server has already committed the URL to a
 * language before this runs, so the first page of a first visit can still arrive in
 * English and switch a moment later; making that flash-free needs the lookup to happen on
 * the server, where the request IP is.
 */
@Injectable({ providedIn: 'root' })
export class GeoPreference {
  private readonly locale = inject(LocaleStore);
  private readonly currency = inject(CurrencyPreference);
  private readonly router = inject(Router);
  private readonly gate = inject(StartupGate);

  /**
   * Applies whichever of the two the visitor has not chosen for themselves. Safe to call
   * unconditionally, and cheap on a return visit: the country is read from storage rather
   * than looked up again.
   *
   * A country that cannot be resolved changes nothing — a failed guess has to be
   * indistinguishable from never having guessed, or a blocked lookup would reset everyone to
   * the app defaults.
   */
  async apply(): Promise<void> {
    if (typeof window === 'undefined') return; // SSR: no visitor IP to read here
    await this.settle(this.cached() ?? (await this.lookup()));
  }

  /**
   * Re-asks, ignoring the stored country, then applies whatever comes back.
   *
   * Called after every `GET /api/users/current`. That endpoint is the app's natural "who and
   * where is this" moment, and tying the refresh to it means a visitor who moves — or flips a
   * VPN — is followed without waiting for the cache to be cleared by hand. The stored country
   * becomes a starting value for the next cold load rather than a decision that outlives the
   * visitor's actual location.
   *
   * Still only fills what the visitor has not chosen: travelling does not overrule them
   * either, which is the whole point of recording the choice.
   */
  async refresh(): Promise<void> {
    if (typeof window === 'undefined') return; // SSR: no visitor IP to read here
    await this.settle(await this.lookup());
  }

  /**
   * Currency first, then language once the router has a URL to rewrite.
   *
   * Ordered that way deliberately: `applyLocale` navigates, and `switchTo` rebuilds the path
   * from `router.url`, which is still "/" until the initial navigation lands. Waiting keeps a
   * deep link intact — without it `/de/search` resolves to a bare `/nl`. Currency needs no URL,
   * so it is applied immediately and never held up by a navigation that may not come.
   */
  private async settle(country: string | null): Promise<void> {
    if (!country) return;

    // Each half stands down on its own. Someone may well pick English and leave the
    // currency alone; treating the two as one switch would strand the currency on whatever
    // the app defaults to the moment they touch the language.
    if (!this.currency.userChoice()) {
      this.currency.set(currencyForCountry(country), 'auto');
    }
    // Two ways to have already answered the language question, and both outrank a guess
    // about where the visitor is. The URL is the stronger of the two: a choice made by
    // whoever wrote the link, which the person who tapped it is entitled to see honoured.
    if (this.locale.userChoice() || this.locale.urlNamedLanguage()) return;

    await this.whenRouted();
    this.applyLocale(country);
  }

  private async whenRouted(): Promise<void> {
    if (this.router.navigated) return;
    await firstValueFrom(
      this.router.events.pipe(
        filter((e): e is NavigationEnd => e instanceof NavigationEnd),
        take(1),
      ),
    );
  }

  /**
   * Moves the visitor to the country's language, from whichever one they are on.
   *
   * Includes moving them *back* to the default: a country that reads English has to be able
   * to undo an earlier switch, or the first non-English country a browser ever saw would
   * stick forever.
   */
  private applyLocale(country: string): void {
    const code = localeForCountry(country);
    if (code === this.locale.active()) return;
    this.locale.switchTo(code, 'auto');
  }

  /**
   * The country last resolved for this visitor, or null before the first lookup lands.
   *
   * Public because the country is worth more than the two preferences derived from it —
   * the search page opens on it. This class owns the key, so reading it anywhere else
   * would be a second copy of the same fact waiting to disagree with this one.
   */
  country(): string | null {
    if (typeof window === 'undefined') return null; // SSR: nothing stored to read
    return this.cached();
  }

  private cached(): string | null {
    try {
      return localStorage.getItem(KEY) || null;
    } catch {
      return null; // private mode, storage disabled
    }
  }

  /** Resolves to null once every source has failed — a wrong guess is worse than no guess. */
  private async lookup(): Promise<string | null> {
    // Held for the whole lookup: the country decides the language, and switching language
    // navigates. Resolving that after the page is readable moves the visitor mid-sentence.
    const release = this.gate.hold();
    try {
      return await this.resolve();
    } finally {
      release();
    }
  }

  private async resolve(): Promise<string | null> {
    const country = await this.raceSources();
    if (country) {
      try {
        localStorage.setItem(KEY, country);
      } catch {
        /* storage disabled — the lookup still stands for this page load */
      }
    }
    return country;
  }

  /**
   * Asks every source at once and takes the first usable answer.
   *
   * Concurrent rather than one-after-another because asking in order makes the whole lookup
   * only as fast as its slowest *unusable* source. Measured behind a VPN: `ipwho.is` hung
   * until it was aborted at 2.5s and `api.country.is` then answered in 0.9s — so a sequential
   * chain spent 3.4s to learn something one of them knew in under a second, and paid it again
   * on every call. Racing costs two extra small GETs and removes that penalty entirely.
   *
   * A source that never answers is not cancelled and not waited for; {@link TOTAL_BUDGET_MS}
   * settles the whole thing regardless.
   */
  private raceSources(): Promise<string | null> {
    return new Promise((resolve) => {
      let pending = SOURCES.length;
      let done = false;
      const finish = (country: string | null): void => {
        if (done) return;
        done = true;
        clearTimeout(timer);
        resolve(country);
      };
      const timer = setTimeout(() => finish(null), TOTAL_BUDGET_MS);

      for (const source of SOURCES) {
        void this.ask(source).then((country) => {
          if (country) finish(country);
          else if (--pending === 0) finish(null); // every source answered, none usably
        });
      }
    });
  }

  /** One source. Never throws: every failure mode is just "this one had no answer". */
  private async ask(source: (typeof SOURCES)[number]): Promise<string | null> {
    try {
      const res = await fetch(source.url, {
        // No cookies and no credentials to a third party, ever.
        credentials: 'omit',
        referrerPolicy: 'no-referrer',
      });
      if (!res.ok) return null;
      return source.read(await res.text());
    } catch {
      return null; // offline, blocked by an extension or VPN, or malformed
    }
  }
}

/**
 * Reads the country out of a JSON response shaped by somebody else.
 *
 * Parsed by hand and narrowed on purpose: these are the one set of payloads in the app not
 * covered by a contract we share with the backend, so a change at the far end should degrade
 * to "no country" rather than throw inside a startup path.
 */
function readJsonCountry(body: string, field: string): string | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(body);
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== 'object') return null;
  const o = parsed as Record<string, unknown>;
  // Some hosts report their own failures in-band with a 200, so a body that says it failed
  // is not an answer no matter what else it carries.
  if (o['success'] === false) return null;
  return normaliseCountry(o[field]);
}

/** An ISO-3166 alpha-2 code, upper-cased — or null for anything that is not one. */
function normaliseCountry(value: unknown): string | null {
  return typeof value === 'string' && /^[A-Za-z]{2}$/.test(value)
    ? value.toUpperCase()
    : null;
}

export { KEY as GEO_COUNTRY_STORAGE_KEY, SOURCES as GEO_SOURCES };
