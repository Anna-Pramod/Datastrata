/**
 * Hashing, in one place.
 *
 * Every integrity guarantee in the verification system reduces to "this text
 * is still the text that was read", so the digest function lives alone and is
 * used everywhere rather than being re-derived per call site.
 */

import { createHash } from 'node:crypto';

/** Lowercase hex SHA-256. Strings are hashed as UTF-8. */
export function sha256Hex(input: string | Uint8Array): string {
  const bytes = typeof input === 'string' ? new TextEncoder().encode(input) : input;
  return createHash('sha256').update(bytes).digest('hex');
}
