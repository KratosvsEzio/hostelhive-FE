// Auth request/response contracts — verified against the Rails backend
// (app/controllers/api/jwt/sessions_controller.rb + api/users_controller.rb).
//
// Envelope: success → { ...payload, success: true }; error → { success: false, errors: string[] }.
// Notable: sign_in & google_login return ONLY a token (no user); sign_up returns the
// user + a message but NO token (the account is activated via an emailed link first);
// the JWT carries no role, so the FE learns the role from GET /api/users/current.

/** POST /api/user/sign_in — credentials are top-level (not nested under `user`). */
export interface SignInRequest {
  email: string;
  password: string;
}

/** POST /api/user/sign_up — Rails strong-params expect a nested `user`. */
export interface SignUpRequest {
  user: { name: string; email: string; password: string; phone?: string };
}

/** POST /api/user/google_login — a Google OAuth access token obtained client-side. */
export interface GoogleLoginRequest {
  access_token: string;
}

/** sign_in & google_login response — a bare JWT, no user echoed. */
export interface TokenResponse {
  success: boolean;
  token?: string;
  errors?: string[];
}

/**
 * sign_up response — the created user + a confirmation message; NO token, because
 * the account must be activated via the emailed confirmation link before sign-in.
 */
export interface SignUpResponse {
  success: boolean;
  user?: SignedUpUser;
  message?: string;
  errors?: string[];
}

/** sign_out response. */
export interface MessageResponse {
  success: boolean;
  message?: string;
}

/** User shape returned by sign_up (UserSerializer). */
export interface SignedUpUser {
  id: number;
  name: string;
  email: string;
  phone?: string | null;
  is_active: boolean;
}

/**
 * GET /api/users/current (CurrentUserSerializer) — the authenticated user with
 * their roles. This is how the FE resolves who is signed in + their role, since
 * the JWT payload itself carries no role/permission data.
 */
export interface CurrentUserResponse {
  success: boolean;
  user: CurrentUser;
}

export interface CurrentUser {
  id: number;
  name: string;
  email: string;
  phone?: string | null;
  is_active: boolean;
  is_admin: boolean;
  roles: ApiRole[];
}

export interface ApiRole {
  id: number;
  name: string;
  slug: string;
}

/** POST /api/user/forgot_password — request a password-reset token by email. */
export interface ForgotPasswordRequest {
  email: string;
}

/** PATCH /api/user/reset_password — set a new password using the emailed token. */
export interface ResetPasswordRequest {
  token: string;
  new_password: string;
}
