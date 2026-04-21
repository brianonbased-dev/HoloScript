export const maxDuration = 300;

/**
 * POST /api/connectors/connect — Connect to external service
 *
 * Establishes connection to a service connector (GitHub, Railway, etc.).
 * Validates credentials, performs health check, and returns connection config.
 *
 * Request body:
 *   - serviceId: 'github' | 'railway' | 'vscode' | 'appstore' | 'upstash'
 *   - credentials: Service-specific credentials object
 *
 * Response:
 *   - success: boolean
 *   - config: Masked configuration object
 *   - error?: string
 *
 * @module api/connectors/connect
 */

import { NextRequest, NextResponse } from 'next/server';
import { GitHubConnector } from '@holoscript/connector-github';
import { RailwayConnector } from '@holoscript/connector-railway';
import { logger } from '@/lib/logger';

import { corsHeaders } from '../../_lib/cors';
type ServiceId = 'github' | 'railway' | 'vscode' | 'appstore' | 'upstash';

interface ConnectRequest {
  serviceId: ServiceId;
  credentials: Record<string, string>;
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as ConnectRequest;
    const { serviceId, credentials } = body;

    if (!serviceId || !credentials) {
      return NextResponse.json(
        { success: false, error: 'Missing serviceId or credentials' },
        { status: 400 }
      );
    }

    switch (serviceId) {
      case 'github': {
        const { token } = credentials;
        if (!token) {
          return NextResponse.json(
            { success: false, error: 'Missing GitHub token' },
            { status: 400 }
          );
        }

        // Set token in environment (ephemeral for this request)
        process.env.GITHUB_TOKEN = token;

        // @ts-ignore - Temporary bypass for stale connector types
        const github = new GitHubConnector();
        // @ts-ignore
        await github.connect();

        // @ts-ignore
        const healthy = await github.health();
        if (!healthy) {
          return NextResponse.json(
            { success: false, error: 'GitHub health check failed' },
            { status: 503 }
          );
        }

        // Get authenticated user info
        // @ts-ignore
        const userResult = await github.executeTool('github_user_get', {});
        const userData =
          userResult && typeof userResult === 'object' && 'data' in userResult
            ? (userResult.data as Record<string, unknown>)
            : null;

        return NextResponse.json({
          success: true,
          config: {
            token: '********', // Masked
            username: userData?.login || null,
            email: userData?.email || null,
          },
        });
      }

      case 'railway': {
        const { token, project } = credentials;
        if (!token) {
          return NextResponse.json(
            { success: false, error: 'Missing Railway token' },
            { status: 400 }
          );
        }

        // Set credentials in environment (ephemeral for this request)
        process.env.RAILWAY_TOKEN = token;
        if (project) {
          process.env.RAILWAY_PROJECT_ID = project;
        }

        // @ts-ignore
        const railway = new RailwayConnector();
        // @ts-ignore
        await railway.connect();

        // @ts-ignore
        const healthy = await railway.health();
        if (!healthy) {
          return NextResponse.json(
            { success: false, error: 'Railway health check failed' },
            { status: 503 }
          );
        }

        return NextResponse.json({
          success: true,
          config: {
            token: '********', // Masked
            project: project || null,
          },
        });
      }

      case 'upstash': {
        const { redisUrl, redisToken, vectorUrl, vectorToken, qstashToken } = credentials;

        // At least one subsystem must be configured
        const hasRedis = redisUrl && redisToken;
        const hasVector = vectorUrl && vectorToken;
        const hasQStash = qstashToken;

        if (!hasRedis && !hasVector && !hasQStash) {
          return NextResponse.json(
            {
              success: false,
              error: 'At least one Upstash subsystem required (Redis, Vector, or QStash)',
            },
            { status: 400 }
          );
        }

        // Set environment variables for available subsystems
        if (hasRedis) {
          process.env.UPSTASH_REDIS_URL = redisUrl;
          process.env.UPSTASH_REDIS_TOKEN = redisToken;
        }
        if (hasVector) {
          process.env.UPSTASH_VECTOR_URL = vectorUrl;
          process.env.UPSTASH_VECTOR_TOKEN = vectorToken;
        }
        if (hasQStash) {
          process.env.QSTASH_TOKEN = qstashToken;
        }

        // Dynamically import to avoid bundling issues
        // @ts-ignore
        const { UpstashConnector } = await import(
          /* webpackIgnore: true */ '@holoscript/connector-upstash'
        );
        const upstash = new (UpstashConnector as unknown as new () => {
          connect(): Promise<void>;
          health(): Promise<boolean>;
          getCapabilities(): unknown;
        })();
        await upstash.connect();

        const healthy = await upstash.health();
        if (!healthy) {
          return NextResponse.json(
            { success: false, error: 'All Upstash subsystems failed health check' },
            { status: 503 }
          );
        }

        return NextResponse.json({
          success: true,
          config: {
            redis: hasRedis
              ? { url: redisUrl.replace(/\/\/.*@/, '//***@'), connected: true }
              : null,
            vector: hasVector
              ? { url: vectorUrl.replace(/\/\/.*@/, '//***@'), connected: true }
              : null,
            qstash: hasQStash ? { connected: true } : null,
          },
        });
      }

      case 'appstore': {
        const { appleKeyId, appleIssuerId, applePrivateKey, googleServiceAccount } = credentials;

        const hasApple = appleKeyId && appleIssuerId && applePrivateKey;
        const hasGoogle = googleServiceAccount;

        if (!hasApple && !hasGoogle) {
          return NextResponse.json(
            { success: false, error: 'At least one platform required (Apple or Google)' },
            { status: 400 }
          );
        }

        // Set environment variables
        if (hasApple) {
          process.env.APPLE_KEY_ID = appleKeyId;
          process.env.APPLE_ISSUER_ID = appleIssuerId;
          process.env.APPLE_PRIVATE_KEY = applePrivateKey;
        }
        if (hasGoogle) {
          process.env.GOOGLE_SERVICE_ACCOUNT = googleServiceAccount;
        }

        // @ts-ignore
        const { AppStoreConnector } = await import(
          /* webpackIgnore: true */ '@holoscript/connector-appstore'
        );
        const appstore = new (AppStoreConnector as unknown as new () => {
          connect(): Promise<void>;
          health(): Promise<boolean>;
          getCapabilities(): unknown;
        })();
        await appstore.connect();

        const healthy = await appstore.health();
        if (!healthy) {
          return NextResponse.json(
            { success: false, error: 'App Store connector health check failed' },
            { status: 503 }
          );
        }

        return NextResponse.json({
          success: true,
          config: {
            apple: hasApple
              ? { keyId: appleKeyId, issuerId: appleIssuerId, connected: true }
              : null,
            google: hasGoogle ? { connected: true } : null,
          },
        });
      }

      case 'vscode': {
        const { bridgeUrl } = credentials;

        // Set bridge URL in environment
        if (bridgeUrl) {
          process.env.VSCODE_BRIDGE_URL = bridgeUrl;
        }

        // @ts-ignore
        const { VSCodeConnector } = await import(
          /* webpackIgnore: true */ '@holoscript/connector-vscode'
        );
        const vscode = new VSCodeConnector();
        await vscode.connect();

        const healthy = await vscode.health();
        if (!healthy) {
          return NextResponse.json(
            { success: false, error: 'VSCode extension not reachable. Is the extension running?' },
            { status: 503 }
          );
        }

        const status = await vscode.executeTool('vscode_extension_status', {});

        return NextResponse.json({
          success: true,
          config: {
            bridgeUrl: bridgeUrl || 'http://localhost:17420',
            ...(status && typeof status === 'object' ? (status as Record<string, unknown>) : {}),
          },
        });
      }

      default: {
        return NextResponse.json(
          { success: false, error: `Unknown service: ${serviceId}` },
          { status: 400 }
        );
      }
    }
  } catch (error) {
    logger.error('[api/connectors/connect] Error:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Connection failed',
      },
      { status: 500 }
    );
  }
}


export function OPTIONS(request: Request) {
  return new Response(null, {
    status: 204,
    headers: corsHeaders(request, { methods: 'GET, POST, PUT, DELETE, PATCH, OPTIONS' }),
  });
}
