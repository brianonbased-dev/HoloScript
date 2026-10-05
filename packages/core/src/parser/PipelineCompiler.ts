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
import {
  CONFIGURED_MCP_SERVER_FORM,
  DEFAULT_PIPELINE_MCP_SERVER,
  DEFAULT_PIPELINE_MCP_URL,
  checkPipelineServers,
} from './PipelineServerPolicy';

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
        PIPELINE_WHERE_KEYWORDS.has(name) || prev === '.' || (name === 'r' && next === '.');

      out += shouldKeep ? name : `r.${name}`;
      i = j;
      continue;
    }

    out += ch;
    i++;
  }

  return out;
}

/**
 * Emit a runtime expression that yields `value` with `${env.X}` / `${env.X:-default}`
 * expanded by the generated `interpolate()` helper, and every other `${...}` left as
 * literal text. The value is embedded as a JSON string literal — never spliced inside
 * a template literal — so nothing a pipeline file wrote is evaluated as code or read
 * into the generated module at build time. This is the single chokepoint for every
 * file-supplied value that supports runtime interpolation (endpoints, paths, the
 * database connection and query, auth tokens, the LLM model, params). (Board task
 * task_1791176003202_obsc.)
 */
function emitInterpolated(value: string): string {
  return `interpolate(${JSON.stringify(value)})`;
}

/**
 * Runtime half of the pipeline server policy (PipelineServerPolicy.ts), emitted
 * once into every module that has an MCP stage. Whatever the compile-time check
 * let through, the generated code reads only HOLOSCRIPT_MCP_URL from a server
 * value, and attaches HOLOSCRIPT_API_KEY only to a request whose origin is the
 * configured MCP server's origin, which is decided when the pipeline runs.
 */
function genMcpRuntime(): string {
  return [
    `const HOLOSCRIPT_DEFAULT_MCP_URL = ${JSON.stringify(DEFAULT_PIPELINE_MCP_URL)};`,
    `const HOLOSCRIPT_MCP_SERVER_FORM = new RegExp(${JSON.stringify(CONFIGURED_MCP_SERVER_FORM.source)});`,
    ``,
    `// The MCP server the operator configured. A pipeline file cannot change it.`,
    `function configuredMcpUrl() {`,
    `  return process.env.HOLOSCRIPT_MCP_URL || HOLOSCRIPT_DEFAULT_MCP_URL;`,
    `}`,
    ``,
    `// A server value reads no environment variable except HOLOSCRIPT_MCP_URL, and only`,
    `// when the whole value is the configured-MCP form. Anything else is used as written.`,
    `// The result must be an absolute http(s) URL. A plain server name is not one: Node`,
    `// throws on the relative URL it would make, but a runtime that has a base URL (a`,
    `// browser) would send the request to the page's own origin. So it is refused here,`,
    `// by name, before any request is built.`,
    `function resolveMcpBase(server, stageLabel) {`,
    `  const configuredForm = HOLOSCRIPT_MCP_SERVER_FORM.exec(server);`,
    `  const base = configuredForm`,
    `    ? process.env.HOLOSCRIPT_MCP_URL || configuredForm[1] || HOLOSCRIPT_DEFAULT_MCP_URL`,
    `    : server || configuredMcpUrl();`,
    `  if (httpOrigin(base) === null) {`,
    `    throw new Error(stageLabel + ' refused: the server ' + JSON.stringify(base) + ' is not an '`,
    `      + 'http(s) address, so the request has nowhere to go. Give this stage a server on the '`,
    `      + 'configured MCP server, or leave server out to use HOLOSCRIPT_MCP_URL.');`,
    `  }`,
    `  return base;`,
    `}`,
    ``,
    `function httpOrigin(url) {`,
    `  try {`,
    `    const parsed = new URL(url);`,
    `    return parsed.protocol === 'http:' || parsed.protocol === 'https:' ? parsed.origin : null;`,
    `  } catch {`,
    `    return null;`,
    `  }`,
    `}`,
    ``,
    `// HOLOSCRIPT_API_KEY goes only to the configured MCP server, never to a server the file chose.`,
    `function mcpHeaders(url) {`,
    `  const headers = { 'Content-Type': 'application/json' };`,
    `  const target = httpOrigin(url);`,
    `  if (process.env.HOLOSCRIPT_API_KEY && target !== null && target === httpOrigin(configuredMcpUrl())) {`,
    `    headers['x-mcp-api-key'] = process.env.HOLOSCRIPT_API_KEY;`,
    `  }`,
    `  return headers;`,
    `}`,
    ``,
    `// MCP requests carry HOLOSCRIPT_API_KEY, so they must not follow a redirect: a 3xx`,
    `// Location could hand the key to another host. 'manual' makes fetch return the`,
    `// redirect instead of following it; we refuse it with a named error.`,
    `async function mcpFetch(url, init, stageLabel) {`,
    `  const response = await fetch(url, { ...init, redirect: 'manual' });`,
    `  if (response.type === 'opaqueredirect' || (response.status >= 300 && response.status < 400)) {`,
    `    throw new Error(stageLabel + ' refused: the MCP server at ' + url + ' answered with a '`,
    `      + 'redirect, which is not followed because an MCP request carries HOLOSCRIPT_API_KEY — '`,
    `      + 'a redirect could send the key to another host.');`,
    `  }`,
    `  return response;`,
    `}`,
  ].join('\n');
}

type McpStageKind = 'source' | 'transform' | 'sink';

/** How the generated code names an MCP stage in its errors, e.g. `MCP sink "ToolOut"`. */
function mcpStageLabel(kind: McpStageKind, stageName: string): string {
  return `MCP ${kind} "${stageName}"`;
}

/**
 * The address and headers of one MCP stage. The server value is embedded as a
 * JSON string literal, so nothing in it is evaluated as code or interpolated.
 */
function genMcpRequestSetup(kind: McpStageKind, stageName: string, server: unknown): string[] {
  const value = String(server || DEFAULT_PIPELINE_MCP_SERVER);
  return [
    `const ${stageName}_base = resolveMcpBase(${JSON.stringify(value)}, ${JSON.stringify(mcpStageLabel(kind, stageName))});`,
    `const ${stageName}_url = ${stageName}_base.replace(/\\/$/, '') + '/mcp';`,
    `const ${stageName}_headers = mcpHeaders(${stageName}_url);`,
  ];
}

function hasMcpStage(pipeline: Pipeline): boolean {
  return (
    pipeline.sources.some((s) => s.type === 'mcp') ||
    pipeline.transforms.some((t) => t.type === 'mcp') ||
    pipeline.sinks.some((s) => s.type === 'mcp')
  );
}

function genSource(source: PipelineSource): string {
  const lines: string[] = [];
  lines.push(`// Source: ${source.name}`);

  if (source.type === 'rest' || source.type === 'webhook') {
    const method = source.method || 'GET';
    lines.push(
      `const ${source.name}_response = await fetch(${emitInterpolated(source.endpoint || '')}, {`
    );
    lines.push(`  method: ${JSON.stringify(method)},`);
    if (source.auth) {
      if (source.auth.type === 'bearer') {
        lines.push(
          `  headers: { 'Authorization': 'Bearer ' + ${emitInterpolated(source.auth.token || '')} },`
        );
      } else if (source.auth.type === 'api_key') {
        lines.push(
          `  headers: { [${JSON.stringify(source.auth.header || 'x-api-key')}]: ${emitInterpolated(source.auth.key || source.auth.token || '')} },`
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
    lines.push(`const ${source.name}_dir = ${emitInterpolated(source.path || '.')};`);
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
    lines.push(
      `const ${source.name}_client = new Client({ connectionString: ${emitInterpolated(connection)} || process.env.DATABASE_URL });`
    );
    lines.push(`await ${source.name}_client.connect();`);
    lines.push(`try {`);
    lines.push(
      `  const ${source.name}_result = await ${source.name}_client.query(${emitInterpolated(query)});`
    );
    lines.push(
      `  if (Array.isArray(${source.name}_result.rows)) records.push(...${source.name}_result.rows);`
    );
    lines.push(`} finally {`);
    lines.push(`  await ${source.name}_client.end();`);
    lines.push(`}`);
  } else if (source.type === 'mcp') {
    const toolName = String(source.properties.tool || source.name);
    const args = JSON.stringify(source.properties.args || {});

    lines.push(...genMcpRequestSetup('source', source.name, source.properties.server));
    lines.push(`const ${source.name}_response = await mcpFetch(${source.name}_url, {`);
    lines.push(`  method: 'POST',`);
    lines.push(`  headers: ${source.name}_headers,`);
    lines.push(`  body: JSON.stringify({`);
    lines.push(`    jsonrpc: '2.0',`);
    lines.push(`    id: Date.now(),`);
    lines.push(`    method: 'tools/call',`);
    lines.push(`    params: {`);
    lines.push(`      name: ${JSON.stringify(toolName)},`);
    lines.push(`      arguments: ${args},`);
    lines.push(`    },`);
    lines.push(`  }),`);
    lines.push(`}, ${JSON.stringify(mcpStageLabel('source', source.name))});`);
    lines.push(`if (!${source.name}_response.ok) {`);
    lines.push(
      `  throw new Error(\`MCP source ${source.name} failed: \${${source.name}_response.status} \${${source.name}_response.statusText}\`);`
    );
    lines.push(`}`);
    lines.push(`const ${source.name}_json = await ${source.name}_response.json();`);
    lines.push(`const ${source.name}_content = ${source.name}_json?.result?.content;`);
    lines.push(
      `if (Array.isArray(${source.name}_content)) records.push(...${source.name}_content);`
    );
    lines.push(
      `else if (${source.name}_json?.result != null) records.push(${source.name}_json.result);`
    );
    lines.push(`else records.push(${source.name}_json);`);
  } else if (source.type === 'list') {
    lines.push(`records.push(...${JSON.stringify(source.properties.items || [])});`);
  } else if (source.type === 'stdout') {
    lines.push(`// stdout source — no-op (for testing)`);
  } else if (source.type === 'stream') {
    // SSE / NDJSON / chunked-JSON streaming endpoint
    const method = source.method || 'GET';
    // Build the headers object in generated code so the auth value is interpolated
    // at run time; the Accept header is a constant.
    lines.push(
      `const ${source.name}_headers = ${JSON.stringify({ Accept: 'text/event-stream, application/x-ndjson, application/json' })};`
    );
    if (source.auth) {
      if (source.auth.type === 'bearer') {
        lines.push(
          `${source.name}_headers['Authorization'] = 'Bearer ' + ${emitInterpolated(source.auth.token || '')};`
        );
      } else if (source.auth.type === 'api_key') {
        lines.push(
          `${source.name}_headers[${JSON.stringify(source.auth.header || 'x-api-key')}] = ${emitInterpolated(source.auth.key || source.auth.token || '')};`
        );
      }
    }
    lines.push(
      `const ${source.name}_resp = await fetch(${emitInterpolated(source.endpoint || '')}, {`
    );
    lines.push(`  method: ${JSON.stringify(method)},`);
    lines.push(`  headers: ${source.name}_headers,`);
    lines.push(`});`);
    lines.push(
      `if (!${source.name}_resp.ok) throw new Error(\`Stream source ${source.name} failed: \${${source.name}_resp.status} \${${source.name}_resp.statusText}\`);`
    );
    lines.push(`const ${source.name}_text = await ${source.name}_resp.text();`);
    lines.push(`// Parse SSE (data: ...) or NDJSON or JSON array`);
    lines.push(`if (${source.name}_text.trim().startsWith('[')) {`);
    lines.push(
      `  try { const arr = JSON.parse(${source.name}_text); if (Array.isArray(arr)) records.push(...arr); } catch { /* fall through to line parsing */ }`
    );
    lines.push(`}`);
    lines.push(`if (records.length === 0) {`);
    lines.push(`  for (const line of ${source.name}_text.split('\\n')) {`);
    lines.push(`    const l = line.trim();`);
    lines.push(`    if (!l || l.startsWith(':')) continue;`);
    lines.push(`    const data = l.startsWith('data: ') ? l.slice(6) : l;`);
    lines.push(`    if (data === '[DONE]') break;`);
    lines.push(`    try { records.push(JSON.parse(data)); } catch { /* skip unparseable line */ }`);
    lines.push(`  }`);
    lines.push(`}`);
  } else {
    lines.push(
      `throw new Error(${JSON.stringify(`Unsupported pipeline source type "${String(source.type)}" in source "${source.name}"`)});`
    );
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
  } else if (transform.type === 'mcp') {
    const toolName = String(transform.tool || transform.name);
    const args = JSON.stringify(transform.args || {});

    lines.push(...genMcpRequestSetup('transform', transform.name, transform.server));
    lines.push(`const ${transform.name}_response = await mcpFetch(${transform.name}_url, {`);
    lines.push(`  method: 'POST',`);
    lines.push(`  headers: ${transform.name}_headers,`);
    lines.push(`  body: JSON.stringify({`);
    lines.push(`    jsonrpc: '2.0',`);
    lines.push(`    id: Date.now(),`);
    lines.push(`    method: 'tools/call',`);
    lines.push(`    params: {`);
    lines.push(`      name: ${JSON.stringify(toolName)},`);
    lines.push(`      arguments: { ...${args}, records, output },`);
    lines.push(`    },`);
    lines.push(`  }),`);
    lines.push(`}, ${JSON.stringify(mcpStageLabel('transform', transform.name))});`);
    lines.push(`if (!${transform.name}_response.ok) {`);
    lines.push(
      `  throw new Error(\`MCP transform ${transform.name} failed: \${${transform.name}_response.status} \${${transform.name}_response.statusText}\`);`
    );
    lines.push(`}`);
    lines.push(`const ${transform.name}_json = await ${transform.name}_response.json();`);
    lines.push(`const ${transform.name}_content = ${transform.name}_json?.result?.content;`);
    lines.push(
      `if (Array.isArray(${transform.name}_content)) records = ${transform.name}_content;`
    );
    lines.push(
      `else if (Array.isArray(${transform.name}_json?.result)) records = ${transform.name}_json.result;`
    );
    lines.push(
      `else if (${transform.name}_content != null) records = [${transform.name}_content];`
    );
  } else if (transform.type === 'llm') {
    // Call an OpenAI-compatible LLM on each record
    const model = transform.model || '${env.LLM_MODEL:-gpt-4o-mini}';
    const prompt = transform.prompt || 'Summarize: {{input}}';
    const inputField = transform.input || '_text';
    const outputField = typeof transform.output === 'string' ? transform.output : '_llm_result';

    lines.push(
      `const ${transform.name}_model = ${emitInterpolated(model)} || process.env.LLM_MODEL || 'gpt-4o-mini';`
    );
    lines.push(
      `const ${transform.name}_apiKey = process.env.OPENAI_API_KEY || process.env.LLM_API_KEY || '';`
    );
    lines.push(
      `const ${transform.name}_base = (process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1').replace(/\\/$/, '');`
    );
    lines.push(`const ${transform.name}_results = [];`);
    lines.push(`for (const r of records) {`);
    lines.push(
      `  const ${transform.name}_input = String(r[${JSON.stringify(inputField)}] ?? JSON.stringify(r));`
    );
    lines.push(
      `  const ${transform.name}_prompt = ${JSON.stringify(prompt)}.replace('{{input}}', ${transform.name}_input);`
    );
    lines.push(
      `  const ${transform.name}_resp = await fetch(${transform.name}_base + '/chat/completions', {`
    );
    lines.push(`    method: 'POST',`);
    lines.push(
      `    headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + ${transform.name}_apiKey },`
    );
    lines.push(
      `    body: JSON.stringify({ model: ${transform.name}_model, messages: [{ role: 'user', content: ${transform.name}_prompt }] }),`
    );
    lines.push(`  });`);
    lines.push(`  if (!${transform.name}_resp.ok) {`);
    lines.push(
      `    console.warn(\`LLM transform ${transform.name} failed: \${${transform.name}_resp.status}\`);`
    );
    lines.push(`    ${transform.name}_results.push(r);`);
    lines.push(`  } else {`);
    lines.push(`    const ${transform.name}_json = await ${transform.name}_resp.json();`);
    lines.push(
      `    const ${transform.name}_text = ${transform.name}_json?.choices?.[0]?.message?.content ?? '';`
    );
    lines.push(
      `    ${transform.name}_results.push({ ...r, [${JSON.stringify(outputField)}]: ${transform.name}_text });`
    );
    lines.push(`  }`);
    lines.push(`}`);
    lines.push(`records = ${transform.name}_results;`);
  } else if (transform.type === 'http') {
    // Make an HTTP call per record and merge the response
    const url = transform.url || '';
    const method = transform.method || 'POST';

    lines.push(`const ${transform.name}_results = [];`);
    lines.push(`for (const r of records) {`);
    lines.push(`  const ${transform.name}_resp = await fetch(${emitInterpolated(url)}, {`);
    lines.push(`    method: ${JSON.stringify(method)},`);
    lines.push(`    headers: { 'Content-Type': 'application/json' },`);
    lines.push(`    body: ${JSON.stringify(method)} === 'GET' ? undefined : JSON.stringify(r),`);
    lines.push(`  });`);
    lines.push(`  if (!${transform.name}_resp.ok) {`);
    lines.push(
      `    console.warn(\`HTTP transform ${transform.name} failed for record: \${${transform.name}_resp.status}\`);`
    );
    lines.push(`    ${transform.name}_results.push(r);`);
    lines.push(`  } else {`);
    lines.push(`    const ${transform.name}_data = await ${transform.name}_resp.json();`);
    lines.push(`    if (Array.isArray(${transform.name}_data)) {`);
    lines.push(`      ${transform.name}_results.push(...${transform.name}_data);`);
    lines.push(`    } else {`);
    lines.push(`      ${transform.name}_results.push({ ...r, ...${transform.name}_data });`);
    lines.push(`    }`);
    lines.push(`  }`);
    lines.push(`}`);
    lines.push(`records = ${transform.name}_results;`);
  } else {
    lines.push(
      `throw new Error(${JSON.stringify(`Unsupported pipeline transform type "${String(transform.type || 'unknown')}" in transform "${transform.name}"`)});`
    );
  }

  return lines.join('\n');
}

function genFilter(filter: PipelineFilter): string {
  const body = qualifyPipelineWhere(filter.where);
  return [`// Filter: ${filter.name}`, `records = records.filter((r) => (${body}));`].join('\n');
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
      lines.push(`  await fetch(${emitInterpolated(sink.endpoint || '')}, {`);
      lines.push(`    method: ${JSON.stringify(method)},`);
      lines.push(`    headers: { 'Content-Type': 'application/json' },`);
      lines.push(`    body: JSON.stringify(batch),`);
      lines.push(`  });`);
      lines.push(`}`);
    } else {
      lines.push(`await fetch(${emitInterpolated(sink.endpoint || '')}, {`);
      lines.push(`  method: ${JSON.stringify(method)},`);
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
        `await ${sink.append ? 'appendFile' : 'writeFile'}(${emitInterpolated(sink.path || '')}, ${sink.name}_lines);`
      );
    } else {
      lines.push(
        `await writeFile(${emitInterpolated(sink.path || '')}, JSON.stringify(records, null, 2));`
      );
    }
  } else if (sink.type === 'database') {
    const connection = String(sink.properties.connection || '${env.DATABASE_URL}');
    const tableRaw = String(sink.properties.table || 'pipeline_records');
    const table = tableRaw.replace(/[^a-zA-Z0-9_]/g, '_');
    lines.push(`const { Client } = await import('pg');`);
    lines.push(
      `const ${sink.name}_client = new Client({ connectionString: ${emitInterpolated(connection)} || process.env.DATABASE_URL });`
    );
    lines.push(`await ${sink.name}_client.connect();`);
    lines.push(`try {`);
    lines.push(`  for (const rec of records) {`);
    lines.push(
      `    await ${sink.name}_client.query('INSERT INTO ${table} (payload) VALUES ($1)', [JSON.stringify(rec)]);`
    );
    lines.push(`  }`);
    lines.push(`} finally {`);
    lines.push(`  await ${sink.name}_client.end();`);
    lines.push(`}`);
  } else if (sink.type === 'mcp') {
    const toolName = String(sink.tool || sink.name);
    const batchSize = sink.batch?.size || 0;
    const args = JSON.stringify(sink.args || {});

    lines.push(...genMcpRequestSetup('sink', sink.name, sink.server));

    lines.push(`const ${sink.name}_invoke = async (payload) => {`);
    lines.push(`  const response = await mcpFetch(${sink.name}_url, {`);
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
    lines.push(`  }, ${JSON.stringify(mcpStageLabel('sink', sink.name))});`);
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
    lines.push(`  const ${sink.name}_template = ${JSON.stringify(sink.template ?? '')};`);
    lines.push(`  const ${sink.name}_holo = ${sink.name}_template.replace(`);
    lines.push(`    /\\$\\{([^}]+)\\}/g,`);
    lines.push(`    (match, expr) => {`);
    lines.push(`      // Guard unsafe expressions — only allow dotted property access`);
    lines.push(`      if (!/^[a-zA-Z_][\\w.\\[\\]]*$/.test(expr.trim())) return match;`);
    lines.push(`      const parts = expr.trim().split('.');`);
    lines.push(`      let value;`);
    lines.push(`      if (parts[0] === 'env') {`);
    lines.push(`        value = process.env[parts.slice(1).join('.')];`);
    lines.push(`      } else if (parts[0] === 'params') {`);
    lines.push(`        value = params[parts.slice(1).join('.')];`);
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
    lines.push(`  const ${sink.name}_path = ${emitInterpolated(sink.path || '')};`);
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
    lines.push(
      `throw new Error(${JSON.stringify(`Unsupported pipeline sink type "${String(sink.type)}" in sink "${sink.name}"`)});`
    );
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

  if (hasMcpStage(pipeline)) {
    lines.push(genMcpRuntime());
    lines.push(``);
  }

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
      // The value is embedded as a JSON string and interpolated at run time, so a
      // ${env.X:-default} fallback resolves correctly and no ${...} is ever code.
      lines.push(`  params[${JSON.stringify(key)}] = ${emitInterpolated(String(rawValue))};`);
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

  // Refuse MCP servers the pipeline file may not choose (PipelineServerPolicy.ts).
  const refusals = checkPipelineServers(parseResult.pipeline);
  if (refusals.length > 0) {
    return {
      success: false,
      errors: refusals.map((e) => e.message),
    };
  }

  const code = compilePipeline(parseResult.pipeline);
  return { success: true, code };
}
