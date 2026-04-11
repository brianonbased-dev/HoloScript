/**
 * POST /api/connectors/oauth/github/start — Initialize GitHub OAuth device flow
 *
 * Starts the GitHub OAuth device authorization flow.
 * Returns device_code, user_code, and verification_uri.
 *
 * GitHub Device Flow Steps:
 * 1. Call this endpoint to get device_code and user_code
 * 2. Show user the user_code and direct them to verification_uri
 * 3. Poll /api/connectors/oauth/github/poll with device_code
 * 4. User authorizes on GitHub.com and enters user_code
 * 5. Poll endpoint returns access_token when authorized
 *
 * Response:
 *   - device_code: string (used for polling)
 *   - user_code: string (shown to user, e.g., "ABCD-1234")
 *   - verification_uri: string (e.g., "https://github.com/login/device")
 *   - expires_in: number (seconds until device_code expires)
 *   - interval: number (minimum seconds between poll requests)
 *
 * @module api/connectors/oauth/github/start
 */

import { NextRequest, NextResponse } from 'next/server';
import { logger } from '@/lib/logger';

// GitHub OAuth App credentials
// In production, these should be in environment variables
const GITHUB_CLIENT_ID = process.env.GITHUB_OAUTH_CLIENT_ID || '';

export async function POST(_req: NextRequest) {
  try {
    if (!GITHUB_CLIENT_ID) {
      return NextResponse.json(
        {
          error: 'GitHub OAuth not configured. Set GITHUB_OAUTH_CLIENT_ID environment variable.',
        },
        { status: 500 }
      );
    }

    // Request device code from GitHub
    const response = await fetch('https://github.com/login/device/code', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({
        client_id: GITHUB_CLIENT_ID,
        scope: 'repo read:user user:email read:org', // Repo access, user info, org membership
      }),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ error: response.statusText }));
      throw new Error(errorData.error || `GitHub API error: ${response.status}`);
    }

    const data = await response.json();

    // GitHub returns:
    // {
    //   device_code: "abc123",
    //   user_code: "ABCD-1234",
    //   verification_uri: "https://github.com/login/device",
    //   expires_in: 900,
    //   interval: 5
    // }

    return NextResponse.json({
      device_code: data.device_code,
      user_code: data.user_code,
      verification_uri: data.verification_uri,
      expires_in: data.expires_in,
      interval: data.interval,
    });
  } catch (error) {
    logger.error('[api/connectors/oauth/github/start] Error:', error);
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : 'Failed to start OAuth flow',
      },
      { status: 500 }
    );
  }
}
