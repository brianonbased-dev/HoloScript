export const maxDuration = 300;

/**
 * POST /api/connectors/oauth/github/poll — Poll for GitHub OAuth authorization
 *
 * Polls GitHub to check if the user has authorized the device code.
 * Called repeatedly by the client until authorization is complete or expires.
 *
 * Request body:
 *   - device_code: string (from /start endpoint)
 *
 * Response (authorization_pending):
 *   - status: 'pending'
 *   - message: 'Authorization pending. User has not yet entered the code.'
 *
 * Response (slow_down):
 *   - status: 'slow_down'
 *   - message: 'Polling too frequently. Slow down.'
 *
 * Response (success):
 *   - status: 'success'
 *   - connected: true
 *   - scope: string (granted scopes)
 *   - token_type: 'bearer'
 *
 * Response (error):
 *   - status: 'error'
 *   - error: string (error code: expired_token, access_denied, etc.)
 *
 * @module api/connectors/oauth/github/poll
 */

import { NextRequest, NextResponse } from 'next/server';
import { logger } from '@/lib/logger';
import {
  createGitHubHeaders,
  GITHUB_API_BASE_URL,
  githubFetchWithRetry,
} from '@/app/api/github/_shared';
import { resolveGitHubDeviceClientId } from '@/lib/github-oauth-config';
import { setGitHubDeviceTokenCookie } from '@/lib/github-device-session';
import {
  mintCapabilityTokenForGitHubUser,
  storeCapabilityTokenInCookie,
} from '@/lib/capability-session';
import type { SurfaceKind } from '@holoscript/secrets-broker';

import { corsHeaders } from '../../../../_lib/cors';

interface PollRequest {
  device_code: string;
  surface?: SurfaceKind;
}

interface GitHubTokenResponse {
  access_token?: string;
  scope?: string;
  token_type?: string;
  error?: string;
  error_description?: string;
}

interface GitHubUserResponse {
  login?: string;
  email?: string | null;
}

export async function POST(req: NextRequest) {
  try {
    const clientId = resolveGitHubDeviceClientId();
    if (!clientId) {
      return NextResponse.json(
        {
          status: 'error',
          error: 'GitHub OAuth not configured',
        },
        { status: 500 }
      );
    }

    const body = (await req.json()) as PollRequest;
    const { device_code } = body;

    if (!device_code) {
      return NextResponse.json(
        {
          status: 'error',
          error: 'Missing device_code',
        },
        { status: 400 }
      );
    }

    // Poll GitHub for access token
    const response = await fetch('https://github.com/login/oauth/access_token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({
        client_id: clientId,
        device_code,
        grant_type: 'urn:ietf:params:oauth:grant-type:device_code',
      }),
    });

    if (!response.ok) {
      throw new Error(`GitHub API error: ${response.status}`);
    }

    const data = (await response.json()) as GitHubTokenResponse;

    // Possible responses:
    // 1. authorization_pending: User hasn't authorized yet
    // 2. slow_down: Polling too frequently
    // 3. expired_token: Device code expired
    // 4. access_denied: User denied access
    // 5. Success: { access_token, scope, token_type }

    if (data.error) {
      switch (data.error) {
        case 'authorization_pending':
          return NextResponse.json({
            status: 'pending',
            message: 'Authorization pending. User has not yet entered the code.',
          });

        case 'slow_down':
          return NextResponse.json({
            status: 'slow_down',
            message: 'Polling too frequently. Increase interval between requests.',
          });

        case 'expired_token':
          return NextResponse.json(
            {
              status: 'error',
              error: 'Device code expired. Start a new authorization flow.',
            },
            { status: 400 }
          );

        case 'access_denied':
          return NextResponse.json(
            {
              status: 'error',
              error: 'User denied access.',
            },
            { status: 403 }
          );

        default:
          return NextResponse.json(
            {
              status: 'error',
              error: data.error_description || data.error,
            },
            { status: 400 }
          );
      }
    }

    if (!data.access_token) {
      return NextResponse.json(
        {
          status: 'error',
          error: 'GitHub did not return an access token.',
        },
        { status: 502 }
      );
    }

    const profile = await loadGitHubUserProfile(data.access_token);

    // S-6: mint a HoloMesh capability token scoped to this GitHub user
    const surface = body.surface;
    const capabilityToken = mintCapabilityTokenForGitHubUser({
      githubUsername: profile.login ?? 'unknown',
      surface,
      ttlSeconds: 15 * 60,
    });

    const result = NextResponse.json({
      status: 'success',
      connected: true,
      scope: data.scope,
      token_type: data.token_type,
      capability_token: {
        token_id: capabilityToken.tokenId,
        handle: capabilityToken.handle,
        surface: capabilityToken.surface,
        trust: capabilityToken.trust,
        capabilities: capabilityToken.capabilities,
        issued_at: capabilityToken.issuedAt,
        expires_at: capabilityToken.expiresAt,
        receipt_hash: capabilityToken.receiptHash,
      },
      config: {
        token: '********',
        username: profile.login ?? '',
        email: profile.email ?? '',
        scope: data.scope ?? '',
      },
    });

    const cookieSet = await setGitHubDeviceTokenCookie(result, data.access_token);
    if (!cookieSet) {
      return NextResponse.json(
        {
          status: 'error',
          error:
            'GitHub OAuth token storage is not configured. Set NEXTAUTH_SECRET or AUTH_SECRET.',
        },
        { status: 500 }
      );
    }

    // Store capability token secret in encrypted cookie as well
    const { cookieSet: capCookieSet } = await storeCapabilityTokenInCookie(result, capabilityToken);
    if (!capCookieSet) {
      return NextResponse.json(
        {
          status: 'error',
          error:
            'Capability token storage is not configured. Set NEXTAUTH_SECRET or AUTH_SECRET.',
        },
        { status: 500 }
      );
    }

    return result;
  } catch (error) {
    logger.error('[api/connectors/oauth/github/poll] Error:', error);
    return NextResponse.json(
      {
        status: 'error',
        error: error instanceof Error ? error.message : 'Failed to poll OAuth status',
      },
      { status: 500 }
    );
  }
}

async function loadGitHubUserProfile(accessToken: string): Promise<GitHubUserResponse> {
  const response = await githubFetchWithRetry(`${GITHUB_API_BASE_URL}/user`, {
    method: 'GET',
    headers: createGitHubHeaders(accessToken),
  });

  if (!response.ok) {
    return {};
  }

  return (await response.json()) as GitHubUserResponse;
}

export function OPTIONS(request: Request) {
  return new Response(null, {
    status: 204,
    headers: corsHeaders(request, { methods: 'GET, POST, PUT, DELETE, PATCH, OPTIONS' }),
  });
}
