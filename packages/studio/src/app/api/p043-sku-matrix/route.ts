import { existsSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { NextRequest, NextResponse } from 'next/server';
import {
  artifactPathForP043QuestCell,
  validateP043QuestArtifact,
  type JsonRecord,
} from '@/lib/p043QuestCapture';

export const runtime = 'nodejs';

function repoRoot(): string {
  let current = process.cwd();
  for (let i = 0; i < 8; i += 1) {
    if (existsSync(path.join(current, 'pnpm-workspace.yaml'))) return current;
    const parent = path.dirname(current);
    if (parent === current) break;
    current = parent;
  }
  return path.resolve(process.cwd(), '../..');
}

function asRecord(input: unknown): JsonRecord {
  return input !== null && typeof input === 'object' && !Array.isArray(input)
    ? (input as JsonRecord)
    : {};
}

function error(status: number, message: string, details?: unknown) {
  return NextResponse.json({ ok: false, error: message, details }, { status });
}

export async function POST(req: NextRequest) {
  const raw = asRecord(await req.json().catch(() => ({})));
  const artifact = raw.artifact === undefined ? raw : asRecord(raw.artifact);
  const validation = validateP043QuestArtifact(artifact);

  if (!validation.ok || !validation.cell) {
    return error(400, 'invalid P043 Quest artifact', validation.errors);
  }

  const artifactPath = artifactPathForP043QuestCell(validation.cell);
  const fullPath = path.join(repoRoot(), artifactPath);
  await mkdir(path.dirname(fullPath), { recursive: true });
  await writeFile(fullPath, `${JSON.stringify(artifact, null, 2)}\n`, 'utf8');

  return NextResponse.json({
    ok: true,
    cellId: validation.cell.id,
    artifactPath,
    path: fullPath,
  });
}

export async function GET(req: NextRequest) {
  const cellId = req.nextUrl.searchParams.get('cellId') ?? '';
  const validation = validateP043QuestArtifact({
    cellId,
    skuId: 'quest3-adreno740',
    status: 'completed',
    captureMode: 'quest-browser-webgpu',
    requiredRuns: 3,
    runs: [{}, {}, {}],
    frameTimeMs: { samples: [1], p50: 1, p95: 1, p99: 1 },
    perUserFrameTimeMs: { p95: 1 },
    sharedSortMs: { p95: 1 },
    visibilityMaskMs: { p95: 1 },
    droppedFrameCount: 0,
    thermalState: 'unknown',
    batteryState: 'unknown',
    browserVersion: 'probe',
    osVersion: 'probe',
    adapterInfo: { vendor: 'Qualcomm', device: 'Adreno 740' },
  });

  if (!validation.cell) return error(400, 'unknown Quest P043 cell');
  const artifactPath = artifactPathForP043QuestCell(validation.cell);
  return NextResponse.json({
    ok: true,
    cellId: validation.cell.id,
    artifactPath,
    path: path.join(repoRoot(), artifactPath),
  });
}
