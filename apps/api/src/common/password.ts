import { randomInt } from 'crypto';

const UPPER = 'ABCDEFGHJKLMNPQRSTUVWXYZ'; // no I/O - avoids visual ambiguity when read aloud/typed
const LOWER = 'abcdefghijkmnpqrstuvwxyz';
const DIGITS = '23456789';
const SYMBOLS = '!@#$%&*';
const ALL = UPPER + LOWER + DIGITS + SYMBOLS;

function pick(chars: string): string {
  return chars[randomInt(chars.length)];
}

/**
 * A one-time, admin-set password for a password reset (docs/09-BUSINESS-
 * RULES.md section 6/7). Meets the existing password policy (>= 8 chars,
 * CreateUserDto/PasswordSchema) with margin, and is never persisted or
 * logged anywhere in plaintext - the caller hands it to the account's
 * owner out of band, and the API response is the only place it appears.
 */
export function generateTempPassword(length = 12): string {
  const required = [pick(UPPER), pick(LOWER), pick(DIGITS), pick(SYMBOLS)];
  const rest = Array.from({ length: length - required.length }, () => pick(ALL));
  const chars = [...required, ...rest];
  // Fisher-Yates shuffle so the guaranteed classes aren't always in the same position.
  for (let i = chars.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    [chars[i], chars[j]] = [chars[j], chars[i]];
  }
  return chars.join('');
}
