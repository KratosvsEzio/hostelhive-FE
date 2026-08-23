// User domain — the authenticated `/api/users` endpoints (app/controllers/api/users_controller.rb).
// The *current* user lives in models/auth.ts (CurrentUserSerializer); this is the plain
// UserSerializer returned by the show endpoint, used e.g. to resolve a contract's host.

/** A role reference, when the serializer includes one (absent on the plain UserSerializer). */
export interface UserRoleRef {
  id: number;
  name: string;
  slug: string;
}

/**
 * GET /api/users/:id (UserSerializer). The core fields (id/name/email/phone/is_active) always
 * come back; the rest are optional so the model also tolerates richer serializers.
 */
export interface User {
  id: number;
  name: string;
  email: string;
  phone?: string | null;
  is_active?: boolean | null;
  is_admin?: boolean | null;
  created_at?: string | null;
  updated_at?: string | null;
  roles?: UserRoleRef[];
  /**
   * Profile photo. Asymmetric like the rest of the API's attachments: reads come back as this
   * object, writes send `avatar_id` (the uploaded document's id) — same shape staff-api and
   * host-ops-api already use for their avatars.
   */
  avatar?: { id?: string | number | null; url?: string | null } | null;
}

/** GET /api/users/:id → `{ success, user }` (some builds return the bare user object). */
export interface UserResponse {
  success?: boolean;
  user?: User;
}
