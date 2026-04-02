import { NextRequest, NextResponse } from 'next/server';
import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';

interface DelegateRequestBody {
  entryId?: string;
  content?: string;
  type?: 'wisdom' | 'pattern' | 'gotcha' | string;
  domain?: string;
  authorName?: string;
  price?: number;
  autoRun?: boolean;
  cycles?: number;
  budgetUsd?: number;
  allowPaid?: boolean;
  teamId?: string;
  source?: string;
}

const REPO_ROOT = process.env.HOLOSCRIPT_REPO_ROOT || process.cwd();
const SKILLS_DIR = path.join(REPO_ROOT, 'compositions', 'skills');
const STATE_DIR = path.join(REPO_ROOT, '.holoscript');

function sanitizeSkillName(input: string): string {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9_-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 64);
}

function escapeForHs(input: string): string {
  return input.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

function appendOutbox(entry: Record<string, unknown>): void {
  if (!fs.existsSync(STATE_DIR)) fs.mkdirSync(STATE_DIR, { recursive: true });
  const outboxPath = path.join(STATE_DIR, 'outbox.jsonl');
  fs.appendFileSync(outboxPath, `${JSON.stringify(entry)}\n`, 'utf-8');
}

function buildDelegatedSkillSource(params: {
  compositionName: string;
  entryId: string;
  summary: string;
  domain: string;
  entryType: string;
  authorName: string;
  budgetUsd: number;
  provenanceHash: string;
}): string {
  const summary = escapeForHs(params.summary);
  const domain = escapeForHs(params.domain);
  const entryType = escapeForHs(params.entryType);
  const authorName = escapeForHs(params.authorName);
  const entryId = escapeForHs(params.entryId);

  return `composition "${params.compositionName}" {
  metadata {
    description: "Delegated from HoloMesh entry ${entryId}"
  }

  @rate_limiter
  @timeout_guard
  @economy

  state status: string = "idle"
  state delegatedEntryId: string = "${entryId}"
  state delegatedDomain: string = "${domain}"
  state delegatedType: string = "${entryType}"
  state delegatedAuthor: string = "${authorName}"
  state delegatedSummary: string = "${summary}"
  state executionCount: number = 0
  state budgetCapUsd: number = ${params.budgetUsd.toFixed(2)}
  state provenanceHash: string = "${params.provenanceHash}"

  action "run_delegate_task" {
    command: "echo"
    args: ["delegated:${entryId}"]
  }

  logic {
    on_start() {
      $status = "running"
      $executionCount = $executionCount + 1
    }
  }

  @test {
    name: "delegate metadata is attached"
    assert: { $delegatedEntryId == "${entryId}" }
  }
}
`;
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as DelegateRequestBody;
    const content = (body.content || '').trim();
    const entryId = (body.entryId || '').trim() || `mesh-${Date.now()}`;

    if (!content) {
      return NextResponse.json({ error: 'content is required' }, { status: 400 });
    }

    const price = Number(body.price || 0);
    const allowPaid = Boolean(body.allowPaid);
    if (price > 0 && !allowPaid) {
      return NextResponse.json(
        {
          error: 'Entry is paid/premium. Set allowPaid=true to explicitly delegate paid content.',
          status: 402,
          entryId,
          price,
        },
        { status: 402 }
      );
    }

    const budgetUsd = Number(body.budgetUsd ?? 0.25);
    if (!Number.isFinite(budgetUsd) || budgetUsd < 0.01 || budgetUsd > 25) {
      return NextResponse.json(
        { error: 'budgetUsd must be between 0.01 and 25.00' },
        { status: 400 }
      );
    }

    const cycles = Math.max(1, Math.min(20, Number(body.cycles ?? 3)));
    const autoRun = body.autoRun !== false;

    const baseName = sanitizeSkillName(`mesh-${entryId}`);
    const skillName = baseName || `mesh-${Date.now()}`;

    if (!fs.existsSync(SKILLS_DIR)) fs.mkdirSync(SKILLS_DIR, { recursive: true });

    const provenanceHash = crypto
      .createHash('sha256')
      .update(`${entryId}:${content}`)
      .digest('hex');

    const source = buildDelegatedSkillSource({
      compositionName: skillName,
      entryId,
      summary: content.slice(0, 180),
      domain: body.domain || 'general',
      entryType: body.type || 'wisdom',
      authorName: body.authorName || 'unknown',
      budgetUsd,
      provenanceHash,
    });

    const skillPath = path.join(SKILLS_DIR, `${skillName}.hsplus`);
    fs.writeFileSync(skillPath, source, 'utf-8');

    appendOutbox({
      timestamp: new Date().toISOString(),
      channel: 'holoclaw:delegate',
      message: `Installed delegated skill ${skillName} from entry ${entryId}`,
      metadata: {
        entryId,
        skillName,
        domain: body.domain || 'general',
        type: body.type || 'wisdom',
        budgetUsd,
        provenanceHash,
        source: body.source || 'manual',
        teamId: body.teamId || null,
      },
    });

    let runResult: unknown = null;
    if (autoRun) {
      const runRes = await fetch(`${req.nextUrl.origin}/api/holoclaw/run`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: skillName, cycles, alwaysOn: false }),
      });
      runResult = await runRes.json().catch(() => ({ status: runRes.status }));
    }

    return NextResponse.json({
      success: true,
      delegated: {
        entryId,
        skillName,
        skillPath: `compositions/skills/${skillName}.hsplus`,
        budgetUsd,
        cycles,
        autoRun,
        provenanceHash,
      },
      run: runResult,
    });
  } catch (err) {
    return NextResponse.json(
      { error: (err as Error).message || 'Failed to delegate entry to HoloClaw' },
      { status: 500 }
    );
  }
}
