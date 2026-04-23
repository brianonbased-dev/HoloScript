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
  } else if (sink.type === 'mcp') {
    const mcpBase = String(sink.server || '${env.HOLOSCRIPT_MCP_URL:-https://mcp.holoscript.net}');
    const toolName = String(sink.tool || sink.name);
    const batchSize = sink.batch?.size || 0;
    const args = JSON.stringify(sink.args || {});

    lines.push(
      `const ${sink.name}_base = interpolate(\`${mcpBase}\`) || process.env.HOLOSCRIPT_MCP_URL || 'https://mcp.holoscript.net';`
    );
    lines.push(`const ${sink.name}_url = ${sink.name}_base.replace(/\\/$/, '') + '/mcp';`);
    lines.push(`const ${sink.name}_headers = { 'Content-Type': 'application/json' };`);
    lines.push(`if (process.env.HOLOSCRIPT_API_KEY) {`);
    lines.push(`  ${sink.name}_headers['x-mcp-api-key'] = process.env.HOLOSCRIPT_API_KEY;`);
    lines.push(`}`);

    lines.push(`const ${sink.name}_invoke = async (payload) => {`);
    lines.push(`  const response = await fetch(${sink.name}_url, {`);
    lines.push(`    method: 'POST',`);
    lines.push(`    headers: ${sink.name}_headers,`);
    lines.push(`    body: JSON.stringify({`);
    lines.push(`      jsonrpc: '2.0',`);
    lines.push(`      id: Date.now(),`);
    lines.push(`      method: 'tools/call',`);
    lines.push(`      params: {`);
    lines.push(`        name: ${JSON.stringify(toolName)},`);
    lines.push(`        arguments: { ...${args}, records: payload, output },`);
    lines.push(`      },`);
    lines.push(`    }),`);
    lines.push(`  });`);
    lines.push(`  if (!response.ok) {`);
    lines.push(
      `    throw new Error(\`MCP sink ${sink.name} failed: \${response.status} \${response.statusText}\`);`
    );
    lines.push(`  }`);
    lines.push(`};`);

    if (batchSize > 0) {
      lines.push(`for (let i = 0; i < records.length; i += ${batchSize}) {`);
      lines.push(`  const batch = records.slice(i, i + ${batchSize});`);
      lines.push(`  await ${sink.name}_invoke(batch);`);
      lines.push(`}`);
    } else {
      lines.push(`await ${sink.name}_invoke(records);`);
    }
  } else if (sink.type === 'stdout') {
    lines.push(`console.log(JSON.stringify(records, null, 2));`);
  } else if (sink.type === 'holo') {
    // Holo sink: emit a .holo composition by interpolating `sink.template`
    // against the last record in the pipeline. Writes the result to `sink.path`
    // and computes a SHA-256 hash of the content so downstream stages (e.g.
    // audit-log sinks) can reference `${output.hash}`.
    lines.push(`import { writeFile } from 'node:fs/promises';`);
    lines.push(`import { createHash } from 'node:crypto';`);
    lines.push(`import { mkdir } from 'node:fs/promises';`);
    lines.push(`import { dirname as ${sink.name}_dirname } from 'node:path';`);
    lines.push(``);
    // Use the final record (or the last one when multiple remain) as the
    // interpolation context. In practice a drug-discovery pipeline produces
    // one composite record per run; multi-record holo sinks are undefined
    // behaviour and fall back to the last record.
    lines.push(`{`);
    lines.push(`  const ${sink.name}_record = records[records.length - 1] ?? {};`);
    lines.push(`  // Template is a raw string with \${...} placeholders; resolve them`);
    lines.push(`  // against the record, env, and pipeline params.`);
    lines.push(
      `  const ${sink.name}_template = ${JSON.stringify(sink.template ?? '')};`
    );
    lines.push(`  const ${sink.name}_holo = ${sink.name}_template.replace(`);
    lines.push(`    /\\$\\{([^}]+)\\}/g,`);
    lines.push(`    (match, expr) => {`);
    lines.push(`      // Guard unsafe expressions — only allow dotted property access`);
    lines.push(`      if (!/^[a-zA-Z_][\\w.\\[\\]]*$/.test(expr.trim())) return match;`);
    lines.push(`      const parts = expr.trim().split('.');`);
    lines.push(`      let value;`);
    lines.push(`      if (parts[0] === 'env') {`);
    lines.push(
      `        value = process.env[parts.slice(1).join('.')];`
    );
    lines.push(`      } else if (parts[0] === 'params') {`);
    lines.push(
      `        value = params[parts.slice(1).join('.')];`
    );
    lines.push(`      } else {`);
    lines.push(`        value = ${sink.name}_record;`);
    lines.push(`        for (const p of parts) {`);
    lines.push(`          if (value == null) break;`);
    lines.push(`          value = value[p];`);
    lines.push(`        }`);
    lines.push(`      }`);
    lines.push(`      return value == null ? match : String(value);`);
    lines.push(`    }`);
    lines.push(`  );`);
    lines.push(`  const ${sink.name}_path = interpolate(\`${sink.path || ''}\`);`);
    lines.push(`  await mkdir(${sink.name}_dirname(${sink.name}_path), { recursive: true });`);
    lines.push(`  await writeFile(${sink.name}_path, ${sink.name}_holo);`);
    lines.push(
      `  const ${sink.name}_hash = createHash('sha256').update(${sink.name}_holo).digest('hex');`
    );
    // Expose the hash + path on a shared `output` object so subsequent sinks can
    // reference ${output.hash} and ${output.holo_path}.
    lines.push(`  output.holo_path = ${sink.name}_path;`);
    lines.push(`  output.hash = ${sink.name}_hash;`);
    lines.push(
      `  console.log(\`[${sink.name}] wrote \${${sink.name}_path} (sha256: \${${sink.name}_hash.slice(0, 16)}...)\`);`
    );
    lines.push(`}`);
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
  lines.push(`  return template.replace(/\\$\\{([^}]+)\\}/g, (match, expr) => {`);
  lines.push(`    // env.VAR or env.VAR:-default`);
  lines.push(`    const envMatch = expr.match(/^env\\.([A-Z_][A-Z0-9_]*)(?::-(.*))?$/);`);
  lines.push(`    if (envMatch) return process.env[envMatch[1]] ?? envMatch[2] ?? '';`);
  lines.push(`    // Leave other expressions (like \${params.X} or \${record.field}) untouched`);
  lines.push(`    // for the holo-sink template interpolator, which handles them separately.`);
  lines.push(`    return match;`);
  lines.push(`  });`);
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
  lines.push(`  // output is populated by sinks that produce downstream-visible artifacts`);
  lines.push(`  // (e.g. holo sinks write output.hash + output.holo_path for audit sinks).`);
  lines.push(`  const output = {};`);
  // Emit params resolution. Pipeline params support env-var fallback syntax:
  //   param_name: "${env.VAR:-default}"
  // Values are resolved at run() time so tests can override via process.env.
  if (pipeline.params && Object.keys(pipeline.params).length > 0) {
    lines.push(`  const params = {};`);
    for (const [key, rawValue] of Object.entries(pipeline.params)) {
      // Escape the raw template literal so it survives transport to generated code
      const escaped = String(rawValue).replace(/\\/g, '\\\\').replace(/`/g, '\\`');
      lines.push(`  params[${JSON.stringify(key)}] = interpolate(\`${escaped}\`);`);
    }
  } else {
    lines.push(`  const params = {};`);
  }
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
