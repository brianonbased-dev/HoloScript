/**
 * HoloScript Pipeline Compiler — Node.js Target
 *
 * Compiles a Pipeline AST into a runnable Node.js ES module.
 * The generated module uses node-cron for scheduling and native fetch for HTTP.
 *
 * @module PipelineCompiler
 */

import { parsePipeline } from './PipelineParser';
import type {
  Pipeline,
  PipelineSource,
  PipelineTransform,
  PipelineFilter,
  PipelineSink,
  PipelineBranch,
  PipelineValidate,
} from './PipelineParser';

export interface CompileOptions {
  moduleName?: string;
}

export interface CompileResult {
  success: boolean;
  code?: string;
  errors?: string[];
}

// =============================================================================
// CODE GENERATION
// =============================================================================

function indent(code: string, level: number): string {
  const pad = '  '.repeat(level);
  return code
    .split('\n')
    .map((l) => (l.trim() ? pad + l : ''))
    .join('\n');
}

/** Keywords / literals that must not get a `r.` prefix in pipeline `where` clauses */
const PIPELINE_WHERE_KEYWORDS = new Set([
  'true',
  'false',
  'null',
  'undefined',
  'NaN',
  'Infinity',
  'typeof',
  'instanceof',
  'void',
  'in',
  'of',
]);

const PIPELINE_WHERE_UNSAFE =
  /[;{}`]|=>|\bfunction\b|\bimport\b|\beval\b|__proto__|constructor|prototype|\bprocess\b|globalThis|\brequire\s*\(/i;

/**
 * Turn bare field names in a pipeline filter/branch expression into `r.field`
 * (e.g. `stock > 0 && status == "active"` → `r.stock > 0 && r.status == "active"`).
 * Expressions that look like injection are rejected (filter keeps all records).
 */
function qualifyPipelineWhere(expr: string): string {
  const trimmed = expr.trim();
  if (!trimmed) return 'true';
  if (PIPELINE_WHERE_UNSAFE.test(trimmed)) {
    return 'true /* unsafe expression skipped */';
  }

  let out = '';
  let i = 0;
  let inQuote: '"' | "'" | null = null;

  while (i < trimmed.length) {
    const ch = trimmed[i];

    if (inQuote) {
      out += ch;
      if (ch === inQuote && trimmed[i - 1] !== '\\') {
        inQuote = null;
      }
      i++;
      continue;
    }

    if (ch === '"' || ch === "'") {
      inQuote = ch;
      out += ch;
      i++;
      continue;
    }

    if (/[a-zA-Z_]/.test(ch)) {
      let j = i + 1;
      while (j < trimmed.length && /[a-zA-Z0-9_]/.test(trimmed[j])) j++;
      const name = trimmed.slice(i, j);
      const prev = i > 0 ? trimmed[i - 1] : '';
      const next = j < trimmed.length ? trimmed[j] : '';

      const shouldKeep =
        PIPELINE_WHERE_KEYWORDS.has(name) ||
        prev === '.' ||
        (name === 'r' && next === '.');

      out += shouldKeep ? name : `r.${name}`;
      i = j;
      continue;
    }

    out += ch;
    i++;
  }

  return out;
}

function genSource(source: PipelineSource): string {
  const lines: string[] = [];
  lines.push(`// Source: ${source.name}`);

  // @ts-expect-error
  if (source.type === 'rest' || source.type === 'webhook') {
    const method = source.method || 'GET';
    lines.push(
      `const ${source.name}_response = await fetch(interpolate(\`${source.endpoint || ''}\`), {`
    );
    lines.push(`  method: '${method}',`);
    if (source.auth) {
      if (source.auth.type === 'bearer') {
        lines.push(
          `  headers: { 'Authorization': \`Bearer \${interpolate('${source.auth.token || ''}')}\` },`
        );
      } else if (source.auth.type === 'api_key') {
        lines.push(
          `  headers: { '${source.auth.header || 'x-api-key'}': interpolate('${source.auth.key || source.auth.token || ''}') },`
        );
      }
    }
    lines.push(`});`);
    lines.push(`let ${source.name}_data = await ${source.name}_response.json();`);
    lines.push(`if (Array.isArray(${source.name}_data)) records.push(...${source.name}_data);`);
    lines.push(`else records.push(${source.name}_data);`);
  } else if (source.type === 'filesystem') {
    lines.push(`import { readdir, readFile } from 'node:fs/promises';`);
    lines.push(`import { join, resolve } from 'node:path';`);
    lines.push(`const ${source.name}_dir = interpolate(\`${source.path || '.'}\`);`);
    lines.push(`const ${source.name}_files = await readdir(${source.name}_dir);`);
    if (source.pattern) {
      lines.push(`const ${source.name}_pattern = ${JSON.stringify(source.pattern)};`);
    }
    lines.push(`for (const f of ${source.name}_files) {`);
    lines.push(`  const content = await readFile(join(${source.name}_dir, f), 'utf-8');`);
    lines.push(`  records.push({ _file: f, content });`);
    lines.push(`}`);
  } else if (source.type === 'database') {
    const connection = String(source.properties.connection || '${env.DATABASE_URL}');
    const query = String(source.properties.query || 'SELECT 1 as ok');
    lines.push(`const { Client } = await import('pg');`);
    lines.push(`const ${source.name}_client = new Client({ connectionString: interpolate(\`${connection}\`) || process.env.DATABASE_URL });`);
    lines.push(`await ${source.name}_client.connect();`);
    lines.push(`try {`);
    lines.push(`  const ${source.name}_result = await ${source.name}_client.query(interpolate(\`${query}\`));`);
    lines.push(`  if (Array.isArray(${source.name}_result.rows)) records.push(...${source.name}_result.rows);`);
    lines.push(`} finally {`);
    lines.push(`  await ${source.name}_client.end();`);
    lines.push(`}`);
  } else if (source.type === 'list') {
    lines.push(`records.push(...${JSON.stringify(source.properties.items || [])});`);
    // @ts-expect-error
  } else if (source.type === 'stdout') {
    lines.push(`// stdout source — no-op (for testing)`);
  } else {
    lines.push(`// TODO: ${source.type} source not yet compiled`);
  }

  return lines.join('\n');
}

function genTransform(transform: PipelineTransform): string {
  const lines: string[] = [];
  lines.push(`// Transform: ${transform.name}`);

  if (transform.type === 'field_mapping' && transform.mappings) {
    lines.push(`records = records.map((r) => {`);
    lines.push(`  const out = { ...r };`);
    for (const m of transform.mappings) {
      if (m.transforms.length > 0) {
        let expr = `r[${JSON.stringify(m.from)}]`;
        for (const fn of m.transforms) {
          expr = `applyTransform(${expr}, ${JSON.stringify(fn)})`;
        }
        lines.push(`  out[${JSON.stringify(m.to)}] = ${expr};`);
      } else {
        lines.push(`  out[${JSON.stringify(m.to)}] = r[${JSON.stringify(m.from)}];`);
      }
      lines.push(`  delete out[${JSON.stringify(m.from)}];`);
    }
    lines.push(`  return out;`);
    lines.push(`});`);
  } else {
    lines.push(`// TODO: ${transform.type || 'unknown'} transform not yet compiled`);
  }

  return lines.join('\n');
}

function genFilter(filter: PipelineFilter): string {
  const body = qualifyPipelineWhere(filter.where);
  return [
    `// Filter: ${filter.name}`,
    `records = records.filter((r) => (${body}));`,
  ].join('\n');
}

function genValidate(validate: PipelineValidate): string {
  const lines: string[] = [];
  lines.push(`// Validate: ${validate.name}`);
  lines.push(`const ${validate.name}_errors = [];`);
  lines.push(`records = records.filter((r, i) => {`);

  for (const field of validate.fields) {
    const isRequired = field.rules.includes('required');
    if (isRequired) {
      lines.push(`  if (r[${JSON.stringify(field.field)}] == null) {`);
      lines.push(`    ${validate.name}_errors.push(\`Record \${i}: ${field.field} is required\`);`);
      lines.push(`    return false;`);
      lines.push(`  }`);
    }
  }

  lines.push(`  return true;`);
  lines.push(`});`);
  lines.push(
    `if (${validate.name}_errors.length) console.warn('Validation:', ${validate.name}_errors);`
  );
  return lines.join('\n');
}

function genBranch(branch: PipelineBranch): string {
  const lines: string[] = [];
  lines.push(`// Branch: ${branch.name}`);
  const sinkKey = (name: string) => JSON.stringify(name);
  const defaultRoute = branch.routes.find((r) => r.condition === 'default');
  const conditional = branch.routes.filter((r) => r.condition !== 'default');
  const routed = `routed_${branch.name.replace(/\W/g, '_')}`;

  lines.push(`const ${routed} = {};`);
  lines.push(`for (const r of records) {`);
  lines.push(`  let _matched = false;`);
  for (const route of conditional) {
    const cond = qualifyPipelineWhere(String(route.condition));
    lines.push(`  if (!_matched && (${cond})) {`);
    lines.push(`    const k = ${sinkKey(route.sinkName)};`);
    lines.push(`    ${routed}[k] = [...(${routed}[k] || []), r];`);
    lines.push(`    _matched = true;`);
    lines.push(`  }`);
  }
  if (defaultRoute) {
    lines.push(`  if (!_matched) {`);
    lines.push(`    const k = ${sinkKey(defaultRoute.sinkName)};`);
    lines.push(`    ${routed}[k] = [...(${routed}[k] || []), r];`);
    lines.push(`  }`);
  }
  lines.push(`}`);
  lines.push(`records = Object.values(${routed}).flat();`);

  return lines.join('\n');
}

function genSink(sink: PipelineSink): string {
  const lines: string[] = [];
  lines.push(`// Sink: ${sink.name}`);

  if (sink.type === 'rest' || sink.type === 'webhook') {
    const method = sink.method || 'POST';
    const batchSize = sink.batch?.size || 0;

    if (batchSize > 0) {
      lines.push(`for (let i = 0; i < records.length; i += ${batchSize}) {`);
      lines.push(`  const batch = records.slice(i, i + ${batchSize});`);
      lines.push(`  await fetch(interpolate(\`${sink.endpoint || ''}\`), {`);
      lines.push(`    method: '${method}',`);
      lines.push(`    headers: { 'Content-Type': 'application/json' },`);
      lines.push(`    body: JSON.stringify(batch),`);
      lines.push(`  });`);
      lines.push(`}`);
    } else {
      lines.push(`await fetch(interpolate(\`${sink.endpoint || ''}\`), {`);
      lines.push(`  method: '${method}',`);
      lines.push(`  headers: { 'Content-Type': 'application/json' },`);
      lines.push(`  body: JSON.stringify(records),`);
      lines.push(`});`);
    }
  } else if (sink.type === 'filesystem') {
    const format = sink.format || 'json';
    lines.push(`import { appendFile, writeFile } from 'node:fs/promises';`);
    if (format === 'jsonl') {
      lines.push(
        `const ${sink.name}_lines = records.map((r) => JSON.stringify(r)).join('\\n') + '\\n';`
      );
      lines.push(
        `await ${sink.append ? 'appendFile' : 'writeFile'}(interpolate(\`${sink.path || ''}\`), ${sink.name}_lines);`
      );
    } else {
      lines.push(
        `await writeFile(interpolate(\`${sink.path || ''}\`), JSON.stringify(records, null, 2));`
      );
    }
  } else if (sink.type === 'database') {
    const connection = String(sink.properties.connection || '${env.DATABASE_URL}');
    const tableRaw = String(sink.properties.table || 'pipeline_records');
    const table = tableRaw.replace(/[^a-zA-Z0-9_]/g, '_');
    lines.push(`const { Client } = await import('pg');`);
    lines.push(`const ${sink.name}_client = new Client({ connectionString: interpolate(\`${connection}\`) || process.env.DATABASE_URL });`);
    lines.push(`await ${sink.name}_client.connect();`);
    lines.push(`try {`);
    lines.push(`  for (const rec of records) {`);
    lines.push(`    await ${sink.name}_client.query('INSERT INTO ${table} (payload) VALUES ($1)', [JSON.stringify(rec)]);`);
    lines.push(`  }`);
    lines.push(`} finally {`);
    lines.push(`  await ${sink.name}_client.end();`);
    lines.push(`}`);
  } else if (sink.type === 'stdout') {
    lines.push(`console.log(JSON.stringify(records, null, 2));`);
  } else {
    lines.push(`// TODO: ${sink.type} sink not yet compiled`);
  }

  return lines.join('\n');
}

// =============================================================================
// MAIN COMPILER
// =============================================================================

function compilePipeline(pipeline: Pipeline): string {
  const lines: string[] = [];

  // Header
  lines.push(`// Generated by HoloScript Pipeline Compiler`);
  lines.push(`// Pipeline: ${pipeline.name}`);
  lines.push(`// Schedule: ${pipeline.schedule || 'manual'}`);
  lines.push(``);

  // Utilities
  lines.push(`function interpolate(template) {`);
  lines.push(
    `  return template.replace(/\\$\\{env\\.([^}]+)\\}/g, (_, key) => process.env[key] || '');`
  );
  lines.push(`}`);
  lines.push(``);
  lines.push(`function applyTransform(value, fn) {`);
  lines.push(`  const name = fn.replace(/\\(.*\\)/, '');`);
  lines.push(`  const arg = fn.match(/\\((.*)\\)/)?.[1];`);
  lines.push(`  switch (name) {`);
  lines.push(`    case 'trim': return typeof value === 'string' ? value.trim() : value;`);
  lines.push(
    `    case 'titleCase': return typeof value === 'string' ? value.replace(/\\b\\w/g, c => c.toUpperCase()) : value;`
  );
  lines.push(
    `    case 'lowercase': return typeof value === 'string' ? value.toLowerCase() : value;`
  );
  lines.push(
    `    case 'uppercase': return typeof value === 'string' ? value.toUpperCase() : value;`
  );
  lines.push(`    case 'multiply': return Number(value) * Number(arg);`);
  lines.push(
    `    case 'round': return Math.round(Number(value) * 10 ** Number(arg || 0)) / 10 ** Number(arg || 0);`
  );
  lines.push(
    `    case 'split': return typeof value === 'string' ? value.split(arg || ',') : [value];`
  );
  lines.push(`    case 'toISO': return new Date(value).toISOString();`);
  lines.push(
    `    case 'truncate': return typeof value === 'string' ? value.slice(0, Number(arg)) : value;`
  );
  lines.push(`    default: return value;`);
  lines.push(`  }`);
  lines.push(`}`);
  lines.push(``);

  // Main function
  lines.push(`export async function run() {`);
  lines.push(`  const startTime = Date.now();`);
  lines.push(`  let records = [];`);
  lines.push(``);

  // Sources
  for (const source of pipeline.sources) {
    lines.push(indent(genSource(source), 1));
    lines.push(``);
  }

  // Transforms
  for (const transform of pipeline.transforms) {
    lines.push(indent(genTransform(transform), 1));
    lines.push(``);
  }

  // Filters
  for (const filter of pipeline.filters) {
    lines.push(indent(genFilter(filter), 1));
    lines.push(``);
  }

  // Validates
  for (const validate of pipeline.validates) {
    lines.push(indent(genValidate(validate), 1));
    lines.push(``);
  }

  // Branches
  for (const branch of pipeline.branches) {
    lines.push(indent(genBranch(branch), 1));
    lines.push(``);
  }

  // Sinks
  for (const sink of pipeline.sinks) {
    lines.push(indent(genSink(sink), 1));
    lines.push(``);
  }

  lines.push(
    `  console.log(\`[${pipeline.name}] completed in \${Date.now() - startTime}ms, \${records.length} records\`);`
  );
  lines.push(`}`);
  lines.push(``);

  // Scheduler
  if (pipeline.schedule) {
    lines.push(`// Schedule: ${pipeline.schedule}`);
    lines.push(`import { schedule } from 'node-cron';`);
    lines.push(`schedule('${pipeline.schedule}', () => run().catch(console.error));`);
    lines.push(`console.log('[${pipeline.name}] scheduled: ${pipeline.schedule}');`);
  } else {
    lines.push(`// No schedule — run once`);
    lines.push(`run().catch(console.error);`);
  }

  return lines.join('\n');
}

// =============================================================================
// PUBLIC API
// =============================================================================

/**
 * Compile a .hs pipeline source string to a Node.js ES module.
 */
export function compilePipelineSourceToNode(
  source: string,
  options: CompileOptions = {}
): CompileResult {
  const parseResult = parsePipeline(source);

  if (!parseResult.pipeline) {
    return {
      success: false,
      errors: parseResult.errors.map((e) => e.message),
    };
  }

  if (parseResult.errors.length > 0) {
    return {
      success: false,
      errors: parseResult.errors.map((e) => e.message),
    };
  }

  const code = compilePipeline(parseResult.pipeline);
  return { success: true, code };
}
