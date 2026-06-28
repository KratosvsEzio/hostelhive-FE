import { Injectable, inject } from '@angular/core';
import { Observable, map } from 'rxjs';
import { User, UserResponse } from '@hostelhive/data-access';
import { ApiClient } from '@core/api-resource';

/**
 * Authenticated user lookups — `GET /api/users/:id` (app/controllers/api/users_controller.rb,
 * UserSerializer). The *current* user is `AuthApi.currentUser()` (CurrentUserSerializer); this is
 * the plain show endpoint, used e.g. to resolve a contract's host in the admin console. The
 * `authInterceptor` attaches the caller's bearer token.
 */
@Injectable({ providedIn: 'root' })
export class UsersApi {
  private readonly api = inject(ApiClient);

  /** GET /api/users/:id → the user (UserSerializer). */
  getById(id: number | string): Observable<User> {
    return this.api
      .get<UserResponse>(`/api/users/${id}`)
      .pipe(map((r) => requireUser(r, id)));
  }

  /** PATCH /api/users/:id → updated user. */
  update(id: number | string, data: { name?: string; phone?: string }): Observable<User> {
    return this.api
      .patch<UserResponse>(`/api/users/${id}`, { user: data })
      .pipe(map((r) => requireUser(r, id)));
  }
}

/** Unwrap `{ user }` (or a bare user object) and fail loudly if it didn't resolve. */
function requireUser(
  r: UserResponse | User | null | undefined,
  id: number | string,
): User {
  const u = (r as UserResponse | null)?.user ?? (r as User | null);
  if (!u || u.id == null) throw new Error(`User ${id} not found`);
  return u;
}
