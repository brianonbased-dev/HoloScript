import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { pathToFileURL } from 'node:url';
import { HoloScriptPlusParser, isPipelineSource, parsePipeline } from '@holoscript/core';

export const NODE_PIPELINE_BRIDGE = 'holoscript-node-pipeline-bridge-v1' as const;

export interface PipelineExecutionResult {
  count: number;
  data: unknown[];
}

export interface ExecutePipelineSourceOptions {
  moduleName?: string;
  mode?: 'default' | 'deterministic-plan';
}

interface PipelineSourceLike {
  name: string;
  type: string;
  items?: Record<string, unknown>[];
  properties: Record<string, unknown>;
  [key: string]: unknown;
}

interface PipelineLike {
  name: string;
  schedule?: string;
  sources: PipelineSourceLike[];
  transforms: unknown[];
  filters: unknown[];
  validates: unknown[];
  merges: unknown[];
  branches: unknown[];
  sinks: unknown[];
  [key: string]: unknown;
}

function normalizeListSource(source: PipelineSourceLike): PipelineSourceLike {
  if (source.type !== 'list') return source;
  const propertiesItems = source.properties.items;
  if (source.items !== undefined) return source;
  let items = propertiesItems;
  if (typeof items === 'string' && items.trim().startsWith('[')) {
    // Backward-compatible bridge for an older built @holoscript/core whose
    // PipelineParser retained inline arrays as text. The canonical parser
    // source now emits `source.items` directly.
    const parsed = new HoloScriptPlusParser().parse(
      `composition "__PipelineInlineList" { items: ${items} }`
    );
    const root = parsed.ast?.root as { properties?: Record<string, unknown> } | undefined;
    if (parsed.errors.length === 0) {
      items = root?.properties?.items;
    }
  }
  if (!Array.isArray(items)) {
    throw new Error(`List source "${source.name}" must declare an items array`);
  }
  return {
    ...source,
    items: items as Record<string, unknown>[],
  };
}

function normalizePipeline(pipeline: PipelineLike): PipelineLike {
  return {
    ...pipeline,
    // PipelineParser historically retained inline list records only in
    // `properties.items`; the compiler reads `source.items`. Normalize at the
    // executable bridge so authored `.hs` list plans are not silently empty.
    sources: pipeline.sources.map(normalizeListSource),
  };
}

function assertDeterministicPlan(pipeline: PipelineLike): void {
  if (!/^[A-Za-z][A-Za-z0-9_-]{0,127}$/.test(pipeline.name)) {
    throw new Error(
      'Deterministic headless plan names must use 1-128 ASCII letters, digits, underscores, or hyphens and begin with a letter'
    );
  }
  if (pipeline.sources.length === 0 || pipeline.sources.some((source) => source.type !== 'list')) {
    throw new Error('Deterministic headless plans require one or more inline list sources');
  }
  const executableNonSourceSteps =
    pipeline.transforms.length +
    pipeline.filters.length +
    pipeline.validates.length +
    pipeline.merges.length +
    pipeline.branches.length;
  if (executableNonSourceSteps !== 0) {
    throw new Error(
      'Deterministic headless plans may contain only inline list sources plus a stdout terminal; transforms and provider steps are forbidden'
    );
  }
  if (
    pipeline.sinks.length === 0 ||
    pipeline.sinks.some(
      (sink) => !sink || typeof sink !== 'object' || (sink as { type?: unknown }).type !== 'stdout'
    )
  ) {
    throw new Error(
      'Deterministic headless plans require only a stdout terminal sink; the host suppresses that sink after capture'
    );
  }
  if (pipeline.schedule !== undefined) {
    throw new Error(
      'Deterministic headless plans use the manifest logical clock, not a wall-clock pipeline schedule'
    );
  }
}

function normalizeResult(result: unknown): PipelineExecutionResult {
  const record = result && typeof result === 'object' ? (result as Record<string, unknown>) : {};
  const data = Array.isArray(record.data) ? record.data : [];
  const count = typeof record.count === 'number' ? record.count : data.length;
  if (!Number.isSafeInteger(count) || count < 0 || count !== data.length) {
    throw new Error('Pipeline run returned an inconsistent record count');
  }
  return { count, data };
}

/**
 * Compile and execute a HoloScript pipeline through the existing Node target.
 *
 * This is intentionally named and receipted as a bridge. It must not be
 * presented as Rust/WASM-native `.hs` execution.
 */
export async function executePipelineSource(
  content: string,
  options: ExecutePipelineSourceOptions = {}
): Promise<PipelineExecutionResult> {
  if (!isPipelineSource(content)) {
    throw new Error('Source is not a HoloScript pipeline');
  }
  const parsed = parsePipeline(content);
  if (!parsed.success || !parsed.pipeline) {
    throw new Error(
      `Pipeline compile failed: ${parsed.errors.map((error) => error.message).join('; ')}`
    );
  }
  let pipeline = normalizePipeline(parsed.pipeline as unknown as PipelineLike);
  if (options.mode === 'deterministic-plan') {
    assertDeterministicPlan(pipeline);
    // The parser's general pipeline grammar requires a terminal sink. For a
    // deterministic plan, data is captured directly by this host and the
    // declarative stdout terminal must not pollute the receipt stream.
    pipeline = { ...pipeline, sinks: [] };
  }

  const compiler = (await import('@holoscript/core/compiler/index')) as unknown as {
    compilePipelineToNode(pipeline: PipelineLike, options: { moduleName: string }): string;
  };
  const code = compiler.compilePipelineToNode(pipeline, {
    // Both fields appear in generated comments in the general compiler. The
    // deterministic path validates the authored pipeline name above and uses
    // a static host-owned module label so neither can terminate a comment.
    moduleName:
      options.mode === 'deterministic-plan'
        ? 'deterministic-headless-plan.hs'
        : (options.moduleName ?? 'pipeline.hs'),
  });
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'holoscript-pipeline-'));
  const modulePath = path.join(tempDir, 'pipeline-runner.mjs');

  try {
    fs.writeFileSync(modulePath, code, 'utf8');
    const moduleUrl = `${pathToFileURL(modulePath).href}?run=${process.pid}`;
    const pipelineModule = (await import(moduleUrl)) as {
      runPipeline?: () => Promise<unknown>;
    };
    if (typeof pipelineModule.runPipeline !== 'function') {
      throw new Error('Pipeline module did not export runPipeline()');
    }
    return normalizeResult(await pipelineModule.runPipeline());
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
}
