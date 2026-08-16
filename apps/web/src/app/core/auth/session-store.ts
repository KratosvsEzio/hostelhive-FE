import { Injectable, computed, signal } from '@angular/core';
import { Permission, Role } from './roles';

/**
 * Persisted session, restored + re-validated on next load (AuthService.restoreSession):
 *  - the JWT lives in a cookie (`hh_auth_token`), NOT localStorage. The FE reads it to set the
 *    Authorization header, so it can't be httpOnly (only the server can set that); it's a
 *    first-party cookie on the app origin and is never sent cross-origin to the API.
 *  - the cached user (for an instant optimistic login) stays in localStorage — profile data,
 *    not the credential.
 * `TOKEN_KEY` is the *legacy* localStorage token key, kept only to migrate + scrub older builds.
 */
const TOKEN_COOKIE = 'hh_auth_token';
const TOKEN_MAX_AGE_DAYS = 30;
const TOKEN_KEY = 'hh.auth.token';
const USER_KEY = 'hh.auth.user';

export interface SessionUser {
  id: string;
  name: string;
  email: string;
  role: Role;
  /** All roles the user holds — may be more than one (e.g. admin + moderator). */
  allRoles: Role[];
  permissions: Permission[];
  /** For manager/warden: the single property they are scoped to. */
  propertyId?: string | null;
}

/**
 * Cross-cutting session state (signals). The single source of truth for who is
 * signed in, their role, granular permission flags, and (for sub-users) their
 * property scope. Can migrate to `@ngrx/signals` if it grows.
 */
@Injectable({ providedIn: 'root' })
export class SessionStore {
  private readonly _user = signal<SessionUser | null>(null);
  private readonly _accessToken = signal<string | null>(null);

  readonly user = this._user.asReadonly();
  readonly accessToken = this._accessToken.asReadonly();
  readonly isAuthenticated = computed(() => this._user() !== null);
  readonly role = computed<Role | null>(() => this._user()?.role ?? null);
  readonly allRoles = computed<Role[]>(() => this._user()?.allRoles ?? []);
  readonly permissions = computed<Permission[]>(
    () => this._user()?.permissions ?? [],
  );
  readonly propertyId = computed<string | null>(
    () => this._user()?.propertyId ?? null,
  );

  setSession(user: SessionUser, accessToken: string): void {
    this._user.set(user);
    this._accessToken.set(accessToken);
    // Persist both so a reload restores the session instantly (user) and re-validates it (token).
    this.persistToken(accessToken);
    this.persistUser(user);
  }

  setAccessToken(token: string | null): void {
    // In-memory only: the transient token used during sign-in / restore before the user is
    // confirmed. The token is *persisted* solely via setSession, once a full session exists.
    this._accessToken.set(token);
  }

  clear(): void {
    this._user.set(null);
    this._accessToken.set(null);
    this.persistToken(null); // drop the persisted session too
    this.persistUser(null);
  }

  /** The JWT persisted from a previous visit — from the cookie (browser only); null on SSR. */
  readPersistedToken(): string | null {
    const fromCookie = readCookie(TOKEN_COOKIE);
    if (fromCookie) return fromCookie;
    // One-time migration: older builds stored the token in localStorage. Use it if present — the
    // next setSession re-homes it into the cookie via persistToken (which also scrubs it).
    return readLegacyToken();
  }

  private persistToken(token: string | null): void {
    if (token) writeCookie(TOKEN_COOKIE, token, TOKEN_MAX_AGE_DAYS);
    else deleteCookie(TOKEN_COOKIE);
    clearLegacyToken(); // the token lives only in the cookie now — drop any localStorage leftover
  }

  /** The user cached from a prior login (browser only) — powers an instant optimistic restore. */
  readPersistedUser(): SessionUser | null {
    if (typeof localStorage === 'undefined') return null;
    try {
      const raw = localStorage.getItem(USER_KEY);
      if (!raw) return null;
      const user = JSON.parse(raw) as SessionUser;
      // `allRoles` was added after this cache shipped, so a returning user can still be
      // holding a blob without it. The parse above is an unchecked cast, so backfill from
      // the primary role rather than handing a malformed user to hasRole().
      if (!Array.isArray(user.allRoles)) {
        user.allRoles = user.role ? [user.role] : [];
      }
      return user;
    } catch {
      return null;
    }
  }

  private persistUser(user: SessionUser | null): void {
    if (typeof localStorage === 'undefined') return;
    try {
      if (user) localStorage.setItem(USER_KEY, JSON.stringify(user));
      else localStorage.removeItem(USER_KEY);
    } catch {
      /* best-effort — the in-memory session still works */
    }
  }

  /** Super Admin implicitly holds every flag; everyone else checks their list. */
  hasPermission(flag: Permission): boolean {
    const user = this._user();
    if (!user) return false;
    return user.role === 'super-admin' || user.permissions.includes(flag);
  }

  hasRole(...roles: Role[]): boolean {
    const user = this._user();
    if (!user) return false;
    // Mirrors the `allRoles` computed's fallback. Every guard and nav check routes through
    // here, so a session that reached the store without the field must not throw.
    const held = Array.isArray(user.allRoles)
      ? user.allRoles
      : user.role
        ? [user.role]
        : [];
    return held.some((r) => roles.includes(r));
  }
}

/* ---- token cookie helpers (SSR-safe) ---------------------------------------- */

function readCookie(name: string): string | null {
  if (typeof document === 'undefined') return null;
  const prefix = `${name}=`;
  for (const part of document.cookie ? document.cookie.split('; ') : []) {
    if (part.startsWith(prefix)) {
      const raw = part.slice(prefix.length);
      try {
        return decodeURIComponent(raw);
      } catch {
        return raw;
      }
    }
  }
  return null;
}

function writeCookie(name: string, value: string, maxAgeDays: number): void {
  if (typeof document === 'undefined') return;
  // `secure` only on HTTPS — a Secure cookie is dropped over plain http (e.g. dev on localhost).
  const secure =
    typeof location !== 'undefined' && location.protocol === 'https:'
      ? '; secure'
      : '';
  const maxAge = Math.floor(maxAgeDays * 86_400);
  document.cookie = `${name}=${encodeURIComponent(value)}; path=/; max-age=${maxAge}; samesite=lax${secure}`;
}

function deleteCookie(name: string): void {
  if (typeof document === 'undefined') return;
  document.cookie = `${name}=; path=/; max-age=0; samesite=lax`;
}

/** Legacy localStorage token (pre-cookie builds) — read once for migration, then cleared. */
function readLegacyToken(): string | null {
  if (typeof localStorage === 'undefined') return null;
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

function clearLegacyToken(): void {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.removeItem(TOKEN_KEY);
  } catch {
    /* ignore */
  }
}
