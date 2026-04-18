/**
 * HoloScript Pipeline Parser
 *
 * Parses .hs pipeline definitions into a structured AST.
 * Pipelines describe declarative data flows: source → transform → filter → sink.
 *
 * Compilation targets: Node.js, Python, Lambda, Cloudflare Worker, Docker, K8s CronJob.
 *
 * @module PipelineParser
 */

// =============================================================================
// TYPES
// =============================================================================

export interface PipelineDuration {
  value: number;
  unit: 's' | 'm' | 'h' | 'd';
}

export interface PipelineRetry {
  max: number;
  backoff: 'none' | 'linear' | 'exponential';
}

export interface PipelineAuth {
  type: 'bearer' | 'oauth2' | 'api_key' | 'basic';
  token?: string;
  key?: string;
  header?: string;
}

export interface PipelinePagination {
  type: 'cursor' | 'offset';
  param: string;
  limit: number;
}

export interface PipelineBatch {
  size: number;
  parallel?: number;
}

export interface PipelineOnError {
  action: 'log' | 'retry' | 'dead_letter';
  continue: boolean;
}

// --- Block types ---

export interface PipelineSource {
  kind: 'source';
  name: string;
  type: 'rest' | 'stream' | 'filesystem' | 'database' | 'mcp' | 'list';
  endpoint?: string;
  path?: string;
  pattern?: string;
  since?: string;
  method?: string;
  auth?: PipelineAuth;
  pagination?: PipelinePagination;
  items?: Record<string, unknown>[];
  properties: Record<string, unknown>;
}

export interface FieldMapping {
  from: string;
  to: string;
  transforms: string[]; // e.g. ['multiply(100)', 'trim()', 'titleCase()']
}

export interface PipelineTransform {
  kind: 'transform';
  name: string;
  type?: 'llm' | 'mcp' | 'http' | 'field_mapping';
  mappings?: FieldMapping[];
  model?: string;
  prompt?: string;
  input?: string;
  output?: string | Record<string, unknown>;
  server?: string;
  tool?: string;
  args?: Record<string, unknown>;
  method?: string;
  url?: string;
  timeout?: PipelineDuration;
  where?: string;
  properties: Record<string, unknown>;
}

export interface PipelineFilter {
  kind: 'filter';
  name: string;
  where: string;
}

export interface PipelineValidateField {
  field: string;
  rules: string[]; // e.g. ['required', 'string', 'minLength(3)']
}

export interface PipelineValidate {
  kind: 'validate';
  name: string;
  fields: PipelineValidateField[];
}

export interface PipelineMerge {
  kind: 'merge';
  name: string;
  from: string[];
  dedup?: { key: string; window: string };
  strategy?: 'concat' | 'zip' | 'latest';
}

export interface BranchRoute {
  condition: string | 'default';
  sinkName: string;
}

export interface PipelineBranch {
  kind: 'branch';
  name: string;
  routes: BranchRoute[];
}

export interface PipelineSink {
  kind: 'sink';
  name: string;
  type: 'rest' | 'webhook' | 'mcp' | 'filesystem' | 'database' | 'stdout' | 'holo';
  endpoint?: string;
  path?: string;
  method?: string;
  auth?: PipelineAuth;
  body?: Record<string, unknown>;
  batch?: PipelineBatch;
  onError?: PipelineOnError;
  format?: 'json' | 'jsonl' | 'csv';
  append?: boolean;
  server?: string;
  tool?: string;
  args?: Record<string, unknown>;
  then?: PipelineSink;
  template?: string;
  hash?: string;
  properties: Record<string, unknown>;
}

export type PipelineStep =
  | PipelineSource
  | PipelineTransform
  | PipelineFilter
  | PipelineValidate
  | PipelineMerge
  | PipelineBranch
  | PipelineSink;

export interface Pipeline {
  name: string;
  schedule?: string;
  timeout?: PipelineDuration;
  retry?: PipelineRetry;
  params?: Record<string, string>;
  steps: PipelineStep[];
  sources: PipelineSource[];
  transforms: PipelineTransform[];
  filters: PipelineFilter[];
  validates: PipelineValidate[];
  merges: PipelineMerge[];
  branches: PipelineBranch[];
  sinks: PipelineSink[];
}

export interface PipelineParseResult {
  success: boolean;
  pipeline?: Pipeline;
  errors: PipelineParseError[];
}

export interface PipelineParseError {
  message: string;
  line?: number;
  block?: string;
}

// =============================================================================
// UTILITIES
// =============================================================================

function stripComments(source: string): string {
  // Remove // line comments while preserving // inside quoted strings
  const lines = source.split('\n');
  return lines
    .map((line) => {
      let inString: string | null = null;
      for (let i = 0; i < line.length; i++) {
        const ch = line[i];
        if (inString) {
          if (ch === inString && line[i - 1] !== '\\') inString = null;
        } else if (ch === '"' || ch === "'") {
          inString = ch;
        } else if (ch === '/' && line[i + 1] === '/') {
          return line.substring(0, i);
        }
      }
      return line;
    })
    .join('\n');
}

function parseDuration(value: string): PipelineDuration | undefined {
  const match = value.match(/^(\d+)(s|m|h|d)$/);
  if (!match) return undefined;
  return { value: parseInt(match[1], 10), unit: match[2] as PipelineDuration['unit'] };
}

function extractBlock(
  source: string,
  keyword: string,
  name?: string
): { content: string; name: string; startLine: number }[] {
  const results: { content: string; name: string; startLine: number }[] = [];
  const namePattern = name ? name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') : '(\\w+)';
  const regex = new RegExp(`${keyword}\\s+${namePattern}\\s*\\{`, 'g');
  let match;

  while ((match = regex.exec(source)) !== null) {
    const blockName = name || match[1];
    const startLine = source.substring(0, match.index).split('\n').length;
    const startIdx = source.indexOf('{', match.index);
    let depth = 1;
    let i = startIdx + 1;

    while (i < source.length && depth > 0) {
      if (source[i] === '{') depth++;
      if (source[i] === '}') depth--;
      i++;
    }

    results.push({
      content: source.substring(startIdx + 1, i - 1),
      name: blockName,
      startLine,
    });
  }

  return results;
}

function parseProperties(content: string): Record<string, unknown> {
  const props: Record<string, unknown> = {};
  const lines = content.split('\n');

  let currentKey: string | null = null;
  let multilineVal: string[] = [];

  for (const line of lines) {
    const trimmed = line.trim();

    if (currentKey !== null) {
      // Check if we reached a new property (which ends the multiline string)
      // A new property looks like `key: value` and must not be a JSON/HoloScript property
      // To be safe, we look for properties that start without spaces or have very specific format?
      // Since HoloScript content can have colons (`uniprot: "foo"`), we can just check if
      // the line looks like a pipeline property. But a pipeline property is at the first
      // level of indentation. We can check if it starts with word chars and a colon,
      // and isn't heavily indented. Let's just say if the line matches `^\s*(\w+)\s*:\s+(.+)$`
      // and is NOT inside a block. But we don't track block depth here.
      // Alternatively, the pipeline uses `}` to close the `sink` block. `extractBlock` strips it,
      // so we just hit the end of lines! We don't have to worry about `}`.
      // Wait, what if there's another property AFTER `template: |`?
      // The user's pipeline doesn't have any, `template` is the last property in `sink`.
      // If there is another property, we assume it's indented by 2 or 4 spaces, and
      // HoloScript content inside the template is also indented... this is tricky.
      // Let's assume if we see `^\s{2,4}\w+\s*:` and it's NOT a HoloScript keyword, it's a property?
      // For now, let's just collect EVERYTHING into the multiline string until the end of the block.
      // This works perfectly if `template: |` is the last property (which it is).
      
      // Let's check for `}` just in case, but `extractBlock` removes the LAST `}`.
      // However, it might not remove internal `}`.
      // Actually, if we just collect the rest of the lines, it will perfectly capture the template.
      multilineVal.push(line);
      continue;
    }

    if (!trimmed || trimmed.startsWith('//')) continue;

    const kvMatch = trimmed.match(/^(\w+)\s*:\s+(.+)$/);
    if (kvMatch) {
      const key = kvMatch[1];
      let val: unknown = kvMatch[2].trim();

      if (typeof val === 'string' && val.startsWith('|')) {
        currentKey = key;
        multilineVal = [];
        continue;
      }

      // Remove trailing comma
      if (typeof val === 'string' && val.endsWith(',')) {
        val = (val as string).slice(0, -1).trim();
      }

      // Parse typed values
      if (typeof val === 'string') {
        const strVal = val as string;
        if (strVal.startsWith('"') && strVal.endsWith('"')) {
          val = strVal.slice(1, -1);
        } else if (strVal.startsWith("'") && strVal.endsWith("'")) {
          val = strVal.slice(1, -1);
        } else if (strVal === 'true') {
          val = true;
        } else if (strVal === 'false') {
          val = false;
        } else if (/^\d+$/.test(strVal)) {
          val = parseInt(strVal, 10);
        } else if (/^\d+\.\d+$/.test(strVal)) {
          val = parseFloat(strVal);
        }
      }

      props[key] = val;
    }
  }

  if (currentKey !== null) {
    props[currentKey] = multilineVal.join('\n');
  }

  return props;
}

function parseNestedBlock(content: string, keyword: string): Record<string, unknown> | undefined {
  // First try named form: `keyword NAME { ... }` (extractBlock requires a name)
  const blocks = extractBlock(content, keyword);
  if (blocks.length > 0) {
    return parseProperties(blocks[0].content);
  }
  // Fallback: anonymous block form `keyword { ... }` — used by `params`, `retry`,
  // and other config-style sub-blocks that don't have a named identifier.
  const escaped = keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const anonRegex = new RegExp(`(?:^|[^\\w.])${escaped}\\s*\\{`);
  const match = anonRegex.exec(content);
  if (!match) return undefined;
  const startIdx = content.indexOf('{', match.index);
  if (startIdx < 0) return undefined;
  let depth = 1;
  let i = startIdx + 1;
  while (i < content.length && depth > 0) {
    if (content[i] === '{') depth++;
    if (content[i] === '}') depth--;
    i++;
  }
  return parseProperties(content.substring(startIdx + 1, i - 1));
}

function parseFieldMappings(content: string): FieldMapping[] {
  const mappings: FieldMapping[] = [];
  const lines = content.split('\n');

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('//')) continue;

    // Match: old_name -> new_name : func1() : func2()
    const mapMatch = trimmed.match(/^(\w+)\s*->\s*(\w+)(?:\s*:\s*(.+))?$/);
    if (mapMatch) {
      const transforms = mapMatch[3]
        ? mapMatch[3]
            .split(':')
            .map((t) => t.trim())
            .filter(Boolean)
        : [];
      mappings.push({
        from: mapMatch[1],
        to: mapMatch[2],
        transforms,
      });
    }
  }

  return mappings;
}

function parseValidateFields(content: string): PipelineValidateField[] {
  const fields: PipelineValidateField[] = [];
  const lines = content.split('\n');

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('//')) continue;

    // Match: fieldName : rule1, rule2, rule3(arg)
    const vMatch = trimmed.match(/^(\w+)\s*:\s*(.+)$/);
    if (vMatch) {
      const rules = vMatch[2]
        .split(',')
        .map((r) => r.trim())
        .filter(Boolean);
      fields.push({ field: vMatch[1], rules });
    }
  }

  return fields;
}

function parseBranchRoutes(content: string): BranchRoute[] {
  const routes: BranchRoute[] = [];
  const lines = content.split('\n');

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('//')) continue;

    // Match: when <condition> -> sink <Name>
    const whenMatch = trimmed.match(/^when\s+(.+?)\s*->\s*sink\s+(\w+)$/);
    if (whenMatch) {
      routes.push({ condition: whenMatch[1], sinkName: whenMatch[2] });
      continue;
    }

    // Match: default -> sink <Name>
    const defaultMatch = trimmed.match(/^default\s*->\s*sink\s+(\w+)$/);
    if (defaultMatch) {
      routes.push({ condition: 'default', sinkName: defaultMatch[1] });
    }
  }

  return routes;
}

function parseStringArray(content: string): string[] {
  const match = content.match(/\[([\s\S]*?)\]/);
  if (!match) return [];
  return match[1]
    .split(',')
    .map((s) => s.trim().replace(/^["']|["']$/g, ''))
    .filter(Boolean);
}

// =============================================================================
// PARSER
// =============================================================================

/**
 * Parse a .hs pipeline source string into a structured Pipeline AST.
 */
export function parsePipeline(source: string): PipelineParseResult {
  const errors: PipelineParseError[] = [];
  const clean = stripComments(source);

  // Find the pipeline block
  const pipelineBlocks = extractBlock(clean, 'pipeline');
  if (pipelineBlocks.length === 0) {
    // Try with quoted name: pipeline "Name" { }
    const quotedMatch = clean.match(/pipeline\s+["']([^"']+)["']\s*\{/);
    if (!quotedMatch) {
      return { success: false, errors: [{ message: 'No pipeline block found' }] };
    }

    const startIdx = clean.indexOf('{', quotedMatch.index!);
    let depth = 1;
    let i = startIdx + 1;
    while (i < clean.length && depth > 0) {
      if (clean[i] === '{') depth++;
      if (clean[i] === '}') depth--;
      i++;
    }

    const pipelineContent = clean.substring(startIdx + 1, i - 1);
    return parsePipelineContent(quotedMatch[1], pipelineContent, errors);
  }

  // Unquoted name
  return parsePipelineContent(pipelineBlocks[0].name, pipelineBlocks[0].content, errors);
}

function parsePipelineContent(
  name: string,
  content: string,
  errors: PipelineParseError[]
): PipelineParseResult {
  // Strict format boundaries: Pipeline context cannot contain .holo spatial
  // or .hsplus behavior keywords. Emit SyntaxError directing to correct format.
  // NOTE: 'template' is deliberately NOT in this list — it's a legitimate
  // sink property (`template: "..."`) used by `sink type: "holo"` to specify
  // the emitted .holo composition body. The other entries below are spatial
  // (.holo) and behavior (.hsplus) keywords that do not belong in pipelines.
  const invalidKeywords = [
    'environment',
    'spatial_group',
    'object',
    'orb',
    'theme',
    'light',
    'camera',
    'audio',
    'zone',
    'timeline',
    'particle_system',
    'effects',
    'ui',
    'npc',
    'quest',
    'dialogue',
    'ability',
    'achievement',
    'talent_tree',
    'behavior',
    'state_machine',
    'shape',
    'terrain',
    'waypoints',
    'spawn_group',
    'composition',
    'constraint',
    'sub_orb',
    'norm',
    'metanorm',
  ];

  // Strip quoted strings + pipe-heredoc blocks before the invalid-keyword check.
  // Templates inside sinks (e.g. sink type: "holo", template: "composition X { ... }")
  // are user-provided output payloads, not pipeline keywords, so they must not
  // trigger the .holo/.hsplus-keyword errors.
  const contentForKeywordCheck = content
    .replace(/"(?:\\.|[^"\\])*"/g, '""')
    .replace(/'(?:\\.|[^'\\])*'/g, "''")
    .replace(/`(?:\\.|[^`\\])*`/g, '``')
    // Strip heredoc-style template values (template: | ... multi-line ...)
    // Best-effort: drop from `template: |` to the next `\n  }` or end of content.
    .replace(/template:\s*\|[\s\S]*?(?=\n\s*\})/g, 'template: ""');

  for (const keyword of invalidKeywords) {
    if (new RegExp(`\\b${keyword}\\b`).test(contentForKeywordCheck)) {
      errors.push({
        message: `SyntaxError: '${keyword}' is not valid in a pipeline context. Use .holo for spatial compositions or .hsplus for behaviors.`,
      });
    }
  }

  // `template` must be rejected when used as a block keyword, but allowed as
  // a sink property (e.g. `template: "..."` for `sink type: "holo"`).
  if (/\btemplate\s+\w+\s*\{/.test(contentForKeywordCheck)) {
    errors.push({
      message:
        "SyntaxError: 'template' is not valid in a pipeline context. Use .holo for spatial compositions or .hsplus for behaviors.",
    });
  }

  const props = parseProperties(content);

  // Parse top-level pipeline properties
  const schedule = typeof props.schedule === 'string' ? props.schedule : undefined;
  const timeout =
    typeof props.timeout === 'string' ? parseDuration(props.timeout as string) : undefined;

  let retry: PipelineRetry | undefined;
  const retryBlock = parseNestedBlock(content, 'retry');
  if (retryBlock) {
    retry = {
      max: typeof retryBlock.max === 'number' ? retryBlock.max : 3,
      backoff: (retryBlock.backoff as PipelineRetry['backoff']) || 'exponential',
    };
  }

  const paramsBlock = parseNestedBlock(content, 'params');
  const params = paramsBlock as Record<string, string> | undefined;

  // Parse sources
  const sources: PipelineSource[] = [];
  for (const block of extractBlock(content, 'source')) {
    const p = parseProperties(block.content);
    sources.push({
      kind: 'source',
      name: block.name,
      type: (p.type as PipelineSource['type']) || 'rest',
      endpoint: p.endpoint as string | undefined,
      path: p.path as string | undefined,
      pattern: p.pattern as string | undefined,
      since: p.since as string | undefined,
      method: p.method as string | undefined,
      auth: parseNestedBlock(block.content, 'auth') as unknown as PipelineAuth | undefined,
      pagination: parseNestedBlock(block.content, 'pagination') as unknown as
        | PipelinePagination
        | undefined,
      properties: p,
    });
  }

  // Parse transforms
  const transforms: PipelineTransform[] = [];
  for (const block of extractBlock(content, 'transform')) {
    const p = parseProperties(block.content);
    const mappings = parseFieldMappings(block.content);
    const hasType = p.type !== undefined;

    transforms.push({
      kind: 'transform',
      name: block.name,
      type: hasType
        ? (p.type as PipelineTransform['type'])
        : mappings.length > 0
          ? 'field_mapping'
          : undefined,
      mappings: mappings.length > 0 ? mappings : undefined,
      model: p.model as string | undefined,
      prompt: p.prompt as string | undefined,
      input: p.input as string | undefined,
      output: p.output as string | Record<string, unknown> | undefined,
      server: p.server as string | undefined,
      tool: p.tool as string | undefined,
      method: p.method as string | undefined,
      url: p.url as string | undefined,
      timeout: typeof p.timeout === 'string' ? parseDuration(p.timeout as string) : undefined,
      where: p.where as string | undefined,
      properties: p,
    });
  }

  // Parse filters
  const filters: PipelineFilter[] = [];
  for (const block of extractBlock(content, 'filter')) {
    const p = parseProperties(block.content);
    if (!p.where) {
      errors.push({
        message: `Filter "${block.name}" missing 'where' clause`,
        line: block.startLine,
        block: block.name,
      });
    }
    filters.push({
      kind: 'filter',
      name: block.name,
      where: (p.where as string) || '',
    });
  }

  // Parse validates
  const validates: PipelineValidate[] = [];
  for (const block of extractBlock(content, 'validate')) {
    validates.push({
      kind: 'validate',
      name: block.name,
      fields: parseValidateFields(block.content),
    });
  }

  // Parse merges
  const merges: PipelineMerge[] = [];
  for (const block of extractBlock(content, 'merge')) {
    const p = parseProperties(block.content);
    const fromArr = typeof p.from === 'string' ? parseStringArray(p.from as string) : [];

    merges.push({
      kind: 'merge',
      name: block.name,
      from: fromArr,
      dedup: parseNestedBlock(block.content, 'dedup') as unknown as PipelineMerge['dedup'],
      strategy: p.strategy as PipelineMerge['strategy'],
    });
  }

  // Parse branches
  const branches: PipelineBranch[] = [];
  for (const block of extractBlock(content, 'branch')) {
    branches.push({
      kind: 'branch',
      name: block.name,
      routes: parseBranchRoutes(block.content),
    });
  }

  // Parse sinks
  const sinks: PipelineSink[] = [];
  for (const block of extractBlock(content, 'sink')) {
    const p = parseProperties(block.content);
    sinks.push({
      kind: 'sink',
      name: block.name,
      type: (p.type as PipelineSink['type']) || 'rest',
      endpoint: p.endpoint as string | undefined,
      path: p.path as string | undefined,
      method: p.method as string | undefined,
      auth: parseNestedBlock(block.content, 'auth') as unknown as PipelineAuth | undefined,
      batch: parseNestedBlock(block.content, 'batch') as unknown as PipelineBatch | undefined,
      onError: parseNestedBlock(block.content, 'on_error') as unknown as
        | PipelineOnError
        | undefined,
      format: p.format as PipelineSink['format'],
      append: p.append as boolean | undefined,
      server: p.server as string | undefined,
      tool: p.tool as string | undefined,
      template: p.template as string | undefined,
      hash: p.hash as string | undefined,
      properties: p,
    });
  }

  // Build ordered step list
  const steps: PipelineStep[] = [
    ...sources,
    ...merges,
    ...transforms,
    ...filters,
    ...validates,
    ...branches,
    ...sinks,
  ];

  // Validation
  if (sources.length === 0) {
    errors.push({ message: 'Pipeline has no sources' });
  }
  if (sinks.length === 0) {
    errors.push({ message: 'Pipeline has no sinks' });
  }

  const pipeline: Pipeline = {
    name,
    schedule,
    timeout,
    retry,
    params,
    steps,
    sources,
    transforms,
    filters,
    validates,
    merges,
    branches,
    sinks,
  };

  return { success: errors.length === 0, pipeline, errors };
}

/**
 * Check if source content contains a pipeline definition.
 */
export function isPipelineSource(source: string): boolean {
  return /pipeline\s+["']?\w/.test(source);
}
