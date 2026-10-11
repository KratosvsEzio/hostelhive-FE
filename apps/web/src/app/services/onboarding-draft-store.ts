import {
  EnvironmentProviders,
  Injectable,
  PLATFORM_ID,
  computed,
  effect,
  inject,
  provideAppInitializer,
  untracked,
} from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { SessionStore } from '@core/auth/session-store';

const STORAGE_KEY = 'hh:onboarding:draft';

/** Draft fields as the onboarding wizard stores them; the store adds and strips `owner`. */
export type OnboardingDraftFields = Record<string, unknown>;

/**
 * The become-a-host draft in localStorage, scoped to the user who wrote it.
 *
 * The draft holds the host's email and phones and the server `draftId` that "Save and continue"
 * updates, and hosts commonly share a browser (family PCs, front desks, cyber cafés). So it is
 * stored flat as `{ owner, ...fields }` under the session user id and only ever handed back to
 * that user: a draft belonging to anyone else — or to no one, as drafts saved before owners
 * existed do — is removed the moment it is read. Signing out removes it too, which is why the
 * store is created eagerly at bootstrap rather than by the onboarding pages, since a sign-out
 * normally happens somewhere else. SSR-safe and best-effort: storage failures are ignored.
 */
@Injectable({ providedIn: 'root' })
export class OnboardingDraftStore {
  private readonly session = inject(SessionStore);
  private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));

  private readonly userId = computed(() => this.session.user()?.id ?? null);
  /**
   * Who the draft may belong to: the user id, or null once fully signed out. A token without a
   * user is a session still being restored or established, which is not a sign-out.
   */
  private readonly holder = computed<string | null | undefined>(() => {
    const id = this.userId();
    if (id !== null) return id;
    return this.session.accessToken() ? undefined : null;
  });

  constructor() {
    effect(() => {
      const holder = this.holder();
      if (holder === undefined) return;
      untracked(() => {
        if (holder === null || this.storedOwner() !== holder) this.clear();
      });
    });
  }

  /**
   * The current user's draft fields, or null. A draft that is not theirs — another user's,
   * ownerless, or unreadable — is removed. Signed out, nothing is returned or removed.
   */
  read(): OnboardingDraftFields | null {
    const owner = untracked(() => this.userId());
    if (owner === null) return null;
    const stored = this.load();
    if (stored === undefined) return null;
    if (stored === null || stored['owner'] !== owner) {
      this.clear();
      return null;
    }
    const fields = { ...stored };
    delete fields['owner'];
    return fields;
  }

  /** Replaces the draft with these fields for the current user; does nothing when signed out. */
  write(fields: OnboardingDraftFields): void {
    const owner = untracked(() => this.userId());
    if (owner === null) return;
    this.save({ ...fields, owner });
  }

  clear(): void {
    const storage = this.storage();
    if (!storage) return;
    try {
      storage.removeItem(STORAGE_KEY);
    } catch {
      /* best-effort: storage may be unavailable */
    }
  }

  /** The owner recorded on the stored draft, or null when there is none or it is unreadable. */
  private storedOwner(): string | null {
    const stored = this.load();
    const owner = stored ? stored['owner'] : null;
    return typeof owner === 'string' ? owner : null;
  }

  /**
   * The stored draft object: undefined when there is no draft (or no storage), null when what
   * is stored is not a draft object.
   */
  private load(): OnboardingDraftFields | null | undefined {
    const storage = this.storage();
    if (!storage) return undefined;
    try {
      const raw = storage.getItem(STORAGE_KEY);
      if (raw === null) return undefined;
      const parsed: unknown = JSON.parse(raw);
      if (
        typeof parsed !== 'object' ||
        parsed === null ||
        Array.isArray(parsed)
      )
        return null;
      return parsed as OnboardingDraftFields;
    } catch {
      return null;
    }
  }

  private save(draft: OnboardingDraftFields): void {
    const storage = this.storage();
    if (!storage) return;
    try {
      storage.setItem(STORAGE_KEY, JSON.stringify(draft));
    } catch {
      /* best-effort: ignore quota / private-mode failures */
    }
  }

  private storage(): Storage | null {
    if (!this.isBrowser || typeof localStorage === 'undefined') return null;
    return localStorage;
  }
}

/**
 * Creates the draft store at bootstrap, in the browser only, so the draft is removed at sign-out
 * even though sign-out normally happens on a page with no onboarding screen to create the store.
 */
export function provideOnboardingDraftCleanup(): EnvironmentProviders {
  return provideAppInitializer(() => {
    if (typeof window === 'undefined') return; // SSR: no stored draft
    inject(OnboardingDraftStore);
  });
}
