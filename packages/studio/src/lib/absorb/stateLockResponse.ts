import { NextResponse } from 'next/server';
import { isAbsorbStateLockTimeout } from './projectState';

/** 503 + Retry-After for a state-file lock timeout (Mapping N5, #617). */
export function absorbStateLockedResponse(retryAfterSeconds = 2): NextResponse {
  return NextResponse.json(
    {
      error: 'Studio is busy saving workspace state. Retry shortly.',
      reason: 'absorb_state_locked',
    },
    { status: 503, headers: { 'Retry-After': String(retryAfterSeconds) } }
  );
}

/** Wrap a route handler so a state-lock timeout answers 503 instead of 500. */
export function withAbsorbStateLock503<A extends unknown[]>(
  handler: (...args: A) => Promise<Response>
): (...args: A) => Promise<Response> {
  return async (...args: A) => {
    try {
      return await handler(...args);
    } catch (err) {
      if (isAbsorbStateLockTimeout(err)) return absorbStateLockedResponse(err.retryAfterSeconds);
      throw err;
    }
  };
}
