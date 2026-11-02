import { createHash, timingSafeEqual } from 'crypto';

/**
 * Constant-time string equality.
 *
 * Both inputs are hashed to fixed-length SHA-256 digests before
 * timingSafeEqual, so the buffers always have equal byte length. That avoids
 * the RangeError timingSafeEqual throws on unequal lengths (e.g. a non-ASCII
 * input whose UTF-16 length matches but whose UTF-8 byte length does not) and
 * does not leak the expected value's length through an early return.
 */
export function constantTimeEqual(a: string, b: string): boolean {
  const da = createHash('sha256').update(a, 'utf8').digest();
  const db = createHash('sha256').update(b, 'utf8').digest();
  return timingSafeEqual(da, db);
}
