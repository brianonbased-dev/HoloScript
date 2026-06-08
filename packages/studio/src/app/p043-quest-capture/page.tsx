import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { P043QuestCapturePanel } from '../../components/quest/P043QuestCapturePanel';
import { parseP043QuestCellId } from '../../lib/p043QuestCapture';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'P043 Quest 3 Capture - HoloScript Studio',
  description: 'Quest Browser capture surface for P043 SKU matrix artifacts.',
};

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

function firstParam(value: string | string[] | undefined): string {
  return Array.isArray(value) ? (value[0] ?? '') : (value ?? '');
}

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

function loadSharedSortShader(): string {
  const shaderPath = path.join(
    repoRoot(),
    'packages',
    'engine',
    'src',
    'gpu',
    'shaders',
    'splat-shared-sort.wgsl'
  );
  return readFileSync(shaderPath, 'utf8');
}

export default async function P043QuestCapturePage({
  searchParams,
}: {
  searchParams?: SearchParams;
}) {
  const params = searchParams ? await searchParams : {};
  const requestedCell = firstParam(params.cellId);
  const initialCellId =
    parseP043QuestCellId(requestedCell)?.id ?? 'quest3-adreno740__indoor-500k__n2';
  const runId = firstParam(params.runId) || `${new Date().toISOString().slice(0, 10)}_p043-quest3`;

  return (
    <P043QuestCapturePanel
      initialCellId={initialCellId}
      initialRunId={runId}
      shaderSource={loadSharedSortShader()}
    />
  );
}
