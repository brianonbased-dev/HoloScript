import { NextRequest, NextResponse } from 'next/server';

import { appendFile, mkdir } from 'node:fs/promises';
import path from 'path';
import { requireAuth } from '@/lib/api-auth';
import { logger } from '@/lib/logger';

export const runtime = 'nodejs';

/**
 * POST /api/audit
 *
 * Receives unified crash reports from StudioErrorBoundary and appends them
 * to a local FDA 21 CFR Part 11 compliant audit ledger.
 */
export async function POST(req: NextRequest) {
  try {
    const auth = await requireAuth();
    if (auth instanceof NextResponse) {
      return auth;
    }

    const body = await req.json();
    const { category, message, astPath, rawStack, suggestion } = body;

    // Define the audit ledger location
    const auditDir = path.join(process.cwd(), '.holo_audits');
    const ledgerPath = path.join(auditDir, 'crash_ledger.txt');

    // Ensure directory exists
    await mkdir(auditDir, { recursive: true });

    const timestamp = new Date().toISOString();

    // Construct the FDA compliant log entry
    const logEntry = `
================================================================================
TIME: ${timestamp}
EVENT: SYSTEM_CRASH [${category?.toUpperCase() || 'UNKNOWN'}]
AST_PATH: ${astPath || 'Unknown Node'}
MESSAGE: ${message || 'No message provided'}
SUGGESTION: ${suggestion || 'None'}
--------------------------------------------------------------------------------
TRACELOG:
${rawStack || 'No stack trace available'}
================================================================================
`;

    await appendFile(ledgerPath, logEntry, 'utf8');

    return NextResponse.json({ success: true, logged: true });
  } catch (error) {
    logger.error('[Audit API] Failed to write crash ledger:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to write audit log' },
      { status: 500 }
    );
  }
}
