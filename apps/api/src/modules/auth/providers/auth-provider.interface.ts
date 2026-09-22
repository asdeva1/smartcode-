import type { AuthUser, TokenPair } from '@smartcode/types';

/**
 * Auth provider abstraction — see docs/06-BACKEND-ARCHITECTURE.md
 * "Auth Provider Abstraction" and docs/07-SECURITY-ARCHITECTURE.md.
 *
 * Every module that needs "who is this user" depends on this interface,
 * not on a concrete implementation. Phase 1 ships LocalAuthProvider
 * (bcrypt/argon2 + JWT). A future KeycloakAuthProvider implements the
 * same interface and is swapped in via the Nest DI container in
 * auth.module.ts — controllers and other services are untouched.
 */
export const AUTH_PROVIDER = 'AUTH_PROVIDER';

export interface AuthProvider {
  /** Validates credentials and returns the identity if valid, else null. */
  validateCredentials(loginName: string, password: string): Promise<AuthUser | null>;

  /** Issues an access + refresh token pair for an authenticated identity. */
  issueTokens(user: AuthUser): Promise<TokenPair>;

  /** Verifies an access token and returns the identity it represents. */
  verifyAccessToken(token: string): Promise<AuthUser>;

  /** Rotates a refresh token, returning a new token pair. */
  refreshTokens(refreshToken: string): Promise<TokenPair>;

  /** Invalidates a refresh token (logout). */
  revokeRefreshToken(refreshToken: string): Promise<void>;
}
