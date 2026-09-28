import { createHash, randomBytes } from 'crypto';

/**
 * Password-reset-link tokens (docs/09-BUSINESS-RULES.md section 8 / Phase
 * 8). The raw token is 256 bits of `crypto.randomBytes` - cryptographically
 * secure, not derived from any predictable input (no timestamp, no user
 * id, no Math.random()) - encoded url-safe so it can go straight into a
 * query string. Only its SHA-256 hash is ever persisted (PasswordResetToken
 * .tokenHash); SHA-256 is the right tool here (not Argon2/bcrypt) because
 * the input is already a high-entropy random value, not a human-chosen
 * secret, so there is nothing for a slow, salted hash to protect against
 * that a fast deterministic hash doesn't already: an attacker with the
 * hash still has to brute-force 256 bits either way, and a deterministic
 * hash is what makes "look up the incoming raw token" a single indexed
 * query instead of a linear scan.
 */
export const RESET_TOKEN_BYTES = 32;

/** How long a generated reset link stays valid - short-lived by design for a credential-reset flow. */
export const RESET_TOKEN_TTL_MINUTES = 60;

export function generateResetToken(): { raw: string; hash: string } {
  const raw = randomBytes(RESET_TOKEN_BYTES).toString('base64url');
  return { raw, hash: hashResetToken(raw) };
}

export function hashResetToken(rawToken: string): string {
  return createHash('sha256').update(rawToken).digest('hex');
}
