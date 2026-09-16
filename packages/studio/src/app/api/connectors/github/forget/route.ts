/**
 * POST /api/connectors/github/forget — drop this browser's linked GitHub
 * credential.
 *
 * Called on sign-out, before the session goes away. The device-flow cookie
 * lives 30 days at path '/', so without this it outlived every sign-out and
 * stayed on a shared machine long after the person who linked it had left.
 *
 * This is hygiene, not the safety property. The credential is also BOUND to the
 * session that obtained it (`lib/github-device-session.ts`), so a cookie left
 * behind by a closed tab is already inert for whoever signs in next. This
 * removes it as well, because an inert credential still sitting in a browser is
 * a credential that can be stolen.
 *
 * Unlike `/api/connectors/disconnect` it touches nothing but this response's
 * cookies: no connector teardown, no process-wide environment, nothing another
 * signed-in caller could notice.
 */

import { NextResponse } from 'next/server';
import { clearGitHubDeviceTokenCookie } from '@/lib/github-device-session';
import { clearCapabilityTokenCookie } from '@/lib/capability-session';

export async function POST() {
  const response = NextResponse.json({ success: true });
  clearGitHubDeviceTokenCookie(response);
  // Minted by the same device-flow response and equally browser-scoped, so it
  // goes at the same moment.
  clearCapabilityTokenCookie(response);
  return response;
}
