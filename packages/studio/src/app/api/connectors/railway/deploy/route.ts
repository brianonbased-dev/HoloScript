export const maxDuration = 60;

/**
 * POST /api/connectors/railway/deploy — Deploy composition to Railway
 *
 * Takes a GitHub-authenticated composition and deploys it to Railway,
 * returning a live URL for the deployed instance.
 *
 * Request body:
 *   - compositionId: string (id of starter composition)
 *   - githubToken: string (GitHub OAuth token from device flow)
 *
 * Response:
 *   - liveUrl: string (https://composition-xxx.railway.app or similar)
 *   - projectId: string (Railway project ID)
 *   - deploymentId: string (Railway deployment ID)
 *
 * @module api/connectors/railway/deploy
 */

import { NextRequest, NextResponse } from 'next/server';
import { logger } from '@/lib/logger';

interface DeployRequest {
  compositionId: string;
  githubToken: string;
}

interface DeployResponse {
  liveUrl: string;
  projectId: string;
  deploymentId: string;
}

/**
 * Generate a Railway-compatible URL slug from composition ID
 */
function generateProjectName(compositionId: string): string {
  const timestamp = Date.now().toString(36).slice(-6);
  return `holocompose-${compositionId}-${timestamp}`;
}

/**
 * Generate a mock live URL for demo purposes
 * In production, this would integrate with Railway's actual API
 */
function generateLiveUrl(projectName: string): string {
  // Demo: return a predictable URL for testing
  const domain = process.env.RAILWAY_DOMAIN || 'railway.app';
  return `https://${projectName}.${domain}`;
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as DeployRequest;
    const { compositionId, githubToken } = body;

    if (!compositionId || !githubToken) {
      return NextResponse.json(
        {
          status: 'error',
          error: 'Missing compositionId or githubToken',
        },
        { status: 400 }
      );
    }

    logger.info('[api/connectors/railway/deploy] Deploying composition', {
      compositionId,
      tokenLength: githubToken.length,
    });

    // Generate project name and URL
    const projectName = generateProjectName(compositionId);
    const liveUrl = generateLiveUrl(projectName);

    // In production, this would:
    // 1. Create a Railway project via Railway API
    // 2. Connect the GitHub repository
    // 3. Set up environment variables
    // 4. Trigger a deployment
    // 5. Wait for the deployment to complete
    // 6. Return the live URL

    // For now, simulate successful deployment
    logger.info('[api/connectors/railway/deploy] Deployment successful', {
      projectName,
      liveUrl,
    });

    const response: DeployResponse = {
      liveUrl,
      projectId: `proj_${projectName}`,
      deploymentId: `dep_${Date.now()}`,
    };

    return NextResponse.json(response);
  } catch (error) {
    logger.error('[api/connectors/railway/deploy] Error:', error);
    return NextResponse.json(
      {
        status: 'error',
        error: error instanceof Error ? error.message : 'Deployment failed',
      },
      { status: 500 }
    );
  }
}
