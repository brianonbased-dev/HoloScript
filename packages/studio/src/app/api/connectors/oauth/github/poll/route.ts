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
 *   - access_token: string (GitHub OAuth token)
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

const GITHUB_CLIENT_ID = process.env.GITHUB_OAUTH_CLIENT_ID || '';

interface PollRequest {
  device_code: string;
}

export async function POST(req: NextRequest) {
  try {
    if (!GITHUB_CLIENT_ID) {
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
        client_id: GITHUB_CLIENT_ID,
        device_code,
        grant_type: 'urn:ietf:params:oauth:grant-type:device_code',
      }),
    });

    if (!response.ok) {
      throw new Error(`GitHub API error: ${response.status}`);
    }

    const data = await response.json();

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

    // Success! Return access token
    return NextResponse.json({
      status: 'success',
      access_token: data.access_token,
      scope: data.scope,
      token_type: data.token_type,
    });
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


export function OPTIONS() {
  return new Response(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, PATCH, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization, x-mcp-api-key',
    },
  });
}
