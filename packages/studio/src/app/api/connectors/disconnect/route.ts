/**
 * POST /api/connectors/disconnect — Disconnect from external service
 *
 * Disconnects from a service connector and cleans up credentials.
 *
 * Request body:
 *   - serviceId: 'github' | 'railway' | 'vscode' | 'appstore' | 'upstash'
 *
 * Response:
 *   - success: boolean
 *   - error?: string
 *
 * @module api/connectors/disconnect
 */

import { NextRequest, NextResponse } from 'next/server';
import { GitHubConnector } from '@holoscript/connector-github';
import { RailwayConnector } from '@holoscript/connector-railway';

type ServiceId = 'github' | 'railway' | 'vscode' | 'appstore' | 'upstash';

interface DisconnectRequest {
  serviceId: ServiceId;
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as DisconnectRequest;
    const { serviceId } = body;

    if (!serviceId) {
      return NextResponse.json(
        { success: false, error: 'Missing serviceId' },
        { status: 400 }
      );
    }

    switch (serviceId) {
      case 'github': {
        const github = new GitHubConnector();
        await github.disconnect();

        // Clear environment variable
        delete process.env.GITHUB_TOKEN;

        return NextResponse.json({ success: true });
      }

      case 'railway': {
        const railway = new RailwayConnector();
        await railway.disconnect();

        // Clear environment variables
        delete process.env.RAILWAY_TOKEN;
        delete process.env.RAILWAY_PROJECT_ID;

        return NextResponse.json({ success: true });
      }

      case 'upstash': {
        const { UpstashConnector } = await import('@holoscript/connector-upstash');
        const upstash = new UpstashConnector();
        await upstash.disconnect();

        // Clear environment variables for all three subsystems
        delete process.env.UPSTASH_REDIS_URL;
        delete process.env.UPSTASH_REDIS_TOKEN;
        delete process.env.UPSTASH_VECTOR_URL;
        delete process.env.UPSTASH_VECTOR_TOKEN;
        delete process.env.QSTASH_TOKEN;

        return NextResponse.json({ success: true });
      }

      case 'appstore': {
        const { AppStoreConnector } = await import('@holoscript/connector-appstore');
        const appstore = new AppStoreConnector();
        await appstore.disconnect();

        // Clear environment variables for both platforms
        delete process.env.APPLE_KEY_ID;
        delete process.env.APPLE_ISSUER_ID;
        delete process.env.APPLE_PRIVATE_KEY;
        delete process.env.GOOGLE_SERVICE_ACCOUNT;

        return NextResponse.json({ success: true });
      }

      case 'vscode': {
        // Not yet implemented
        return NextResponse.json(
          {
            success: false,
            error: `${serviceId} connector not yet implemented`,
          },
          { status: 501 }
        );
      }

      default: {
        return NextResponse.json(
          { success: false, error: `Unknown service: ${serviceId}` },
          { status: 400 }
        );
      }
    }
  } catch (error) {
    console.error('[api/connectors/disconnect] Error:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Disconnection failed',
      },
      { status: 500 }
    );
  }
}
