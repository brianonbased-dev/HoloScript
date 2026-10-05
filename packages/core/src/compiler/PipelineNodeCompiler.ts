/**
 * PipelineNodeCompiler
 *
 * Compiles a parsed .hs pipeline AST into a runnable Node.js ESM module.
 */

import {
  parsePipeline,
  type Pipeline,
  type PipelineFilter,
  type PipelineTransform,
  type PipelineValidate,
  type PipelineSink,
  type PipelineSource,
} from '../parser/PipelineParser';

export interface PipelineNodeCompilerOptions {
  moduleName?: string;
}

export interface PipelinePythonCompilerOptions {
  moduleName?: string;
}

export type PipelineCompileTarget = 'node' | 'python';

export interface PipelineCompilerOptions {
  target?: PipelineCompileTarget;
  node?: PipelineNodeCompilerOptions;
  python?: PipelinePythonCompilerOptions;
}

function json(value: unknown): string {
  return JSON.stringify(value, null, 2);
}

function unsupportedPipelineStep(
  kind: 'source' | 'sink',
  type: string | undefined,
  name: string
): string {
  const typeLabel = type || 'unknown';
  return `[PipelineNodeCompiler] Unsupported pipeline ${kind} type "${typeLabel}" (step: ${name}). PipelineNodeCompiler does not yet emit code for this type.`;
}

function unsupportedNodeThrow(
  kind: 'source' | 'sink',
  type: string | undefined,
  name: string
): string {
  return `(() => { throw new Error(${json(unsupportedPipelineStep(kind, type, name))}); })()`;
}

function unsupportedPythonRaise(
  kind: 'source' | 'sink',
  type: string | undefined,
  name: string
): string {
  return `raise NotImplementedError(${json(unsupportedPipelineStep(kind, type, name))})`;
}

function emitSource(source: PipelineSource): string {
  switch (source.type) {
    case 'rest':
    case 'stream':
      return `await fetchJSON(${json(source.endpoint || '')}, { method: ${json(source.method || 'GET')} })`;
    case 'filesystem':
      return `await readJSONArray(${json(source.path || '')})`;
    case 'list':
      return json(source.items || []);
    default:
      return unsupportedNodeThrow('source', source.type, source.name);
  }
}

function emitFieldMappingTransform(t: PipelineTransform): string {
  const mappings = t.mappings || [];
  const unwrapMappings = mappings.filter((m) => m.from.endsWith('[]'));
  const valueMappings = mappings.filter((m) => !m.from.endsWith('[]'));
  const lines: string[] = [];

  for (const mapping of unwrapMappings) {
    lines.push(
      `data = data.flatMap((item) => unwrapPathValues(item, ${json(mapping.from)}).map((value) => ({ ...item, ${json(mapping.to)}: applyTransforms(value, ${json(mapping.transforms || [])}) })));`
    );
  }

  if (valueMappings.length === 0) {
    return lines.join('\n');
  }

  const mapExpr = valueMappings
    .map(
      (m) =>
        `${json(m.to)}: applyTransforms(getPathValue(item, ${json(m.from)}), ${json(m.transforms || [])})`
    )
    .join(',\n      ');

  lines.push(`data = data.map((item) => ({\n      ${mapExpr}\n    }));`);
  return lines.join('\n');
}

function emitTransform(t: PipelineTransform): string {
  if ((t.type === 'field_mapping' || !t.type) && t.mappings && t.mappings.length > 0) {
    return emitFieldMappingTransform(t);
  }

  if (t.type === 'http') {
    return `data = await Promise.all(data.map(async (item) => ({ ...item, _http: await fetchJSON(${json(t.url || '')}, { method: ${json(t.method || 'GET')} }) })));`;
  }

  if (t.type === 'mcp') {
    return `// MCP transform (${t.name}) is a runtime integration point; preserving pass-through for now.`;
  }

  if (t.type === 'llm') {
    return `// LLM transform (${t.name}) is a runtime integration point; preserving pass-through for now.`;
  }

  return `// transform ${t.name} (no-op)`;
}

function emitFilter(f: PipelineFilter): string {
  return `data = data.filter((item) => evalCondition(item, ${json(f.where)}));`;
}

function emitValidate(v: PipelineValidate): string {
  const fields = json(v.fields || []);
  return `data = data.filter((item) => validateItem(item, ${fields}));`;
}

function emitSink(sink: PipelineSink): string {
  switch (sink.type) {
    case 'stdout':
      return `console.log(${json(`[${sink.name}]`)}, data);`;
    case 'filesystem':
      return `await writeOutput(${json(sink.path || './pipeline-output.jsonl')}, data, ${json(sink.format || 'jsonl')}, ${json(Boolean(sink.append))});`;
    case 'rest':
    case 'webhook':
      return `await postJSON(${json(sink.endpoint || '')}, data, { method: ${json(sink.method || 'POST')} });`;
    case 'mcp':
      return `console.warn(${json(`[${sink.name}] mcp sink requires host integration: ${sink.server || ''}/${sink.tool || ''}`)});`;
    default:
      return `${unsupportedNodeThrow('sink', sink.type, sink.name)};`;
  }
}

function emitPythonSource(source: PipelineSource): string {
  switch (source.type) {
    case 'rest':
    case 'stream':
      return `datasets[${json(source.name)}] = await fetch_json(${json(source.endpoint || '')}, method=${json(source.method || 'GET')})`;
    case 'filesystem':
      return `datasets[${json(source.name)}] = await read_json_array(${json(source.path || '')})`;
    case 'list':
      return `datasets[${json(source.name)}] = ${json(source.items || [])}`;
    default:
      return unsupportedPythonRaise('source', source.type, source.name);
  }
}

function emitPythonFieldMappingTransform(t: PipelineTransform): string {
  const mappings = t.mappings || [];
  const mappingLines = mappings
    .map(
      (m) =>
        `${json(m.to)}: apply_transforms(item.get(${json(m.from)}), ${json(m.transforms || [])}),`
    )
    .join('\n                ');

  return `data = [\n        {\n            ${mappingLines}\n        }\n        for item in data\n    ]`;
}

function emitPythonTransform(t: PipelineTransform): string {
  if ((t.type === 'field_mapping' || !t.type) && t.mappings && t.mappings.length > 0) {
    return emitPythonFieldMappingTransform(t);
  }

  if (t.type === 'http') {
    return `# HTTP transform (${t.name}) is a runtime integration point; preserving pass-through for now.`;
  }

  if (t.type === 'mcp') {
    return `# MCP transform (${t.name}) is a runtime integration point; preserving pass-through for now.`;
  }

  if (t.type === 'llm') {
    return `# LLM transform (${t.name}) is a runtime integration point; preserving pass-through for now.`;
  }

  return `# transform ${t.name} (no-op)`;
}

function emitPythonFilter(f: PipelineFilter): string {
  return `data = [item for item in data if eval_condition(item, ${json(f.where)})]`;
}

function emitPythonValidate(v: PipelineValidate): string {
  const fields = json(v.fields || []);
  return `data = [item for item in data if validate_item(item, ${fields})]`;
}

function emitPythonSink(sink: PipelineSink): string {
  switch (sink.type) {
    case 'stdout':
      return `print(${json(`[${sink.name}]`)}, data)`;
    case 'filesystem':
      return `await write_output(${json(sink.path || './pipeline-output.jsonl')}, data, ${json(sink.format || 'jsonl')}, ${json(Boolean(sink.append))})`;
    case 'rest':
    case 'webhook':
      return `await post_json(${json(sink.endpoint || '')}, data, method=${json(sink.method || 'POST')})`;
    case 'mcp':
      return `print(${json(`[${sink.name}] mcp sink requires host integration: ${sink.server || ''}/${sink.tool || ''}`)})`;
    default:
      return unsupportedPythonRaise('sink', sink.type, sink.name);
  }
}

// The exact pattern the generated resolveTemplate() reads from the environment:
// ${env.NAME}. Keep this in lockstep with resolveTemplate below.
const ENV_READ_RX = /\$\{env\.([A-Za-z_][A-Za-z0-9_]*)\}/g;

// HOLOSCRIPT_MCP_URL is the configured MCP server and is always readable without a
// flag (matches the server-origin policy in parser/PipelineServerPolicy.ts).
const ALWAYS_ALLOWED_ENV = 'HOLOSCRIPT_MCP_URL';

/** Collect the ${env.NAME} reads from one string. */
function envNamesIn(value: string | undefined): string[] {
  if (!value) return [];
  return [...value.matchAll(ENV_READ_RX)].map((m) => m[1]);
}

/** The static http(s) origin a value would request, or null when it is a file path or dynamic. */
function staticHostIn(value: string | undefined): string | null {
  if (!value) return null;
  const m = /^(https?:\/\/[^/$]+)(?:[/?#]|$)/.exec(value);
  return m ? m[1] : null;
}

/**
 * The environment variables a pipeline reads and the request hosts it targets, derived
 * from exactly the fields the generated module passes to resolveTemplate()/fetch:
 * rest/stream/webhook endpoints, filesystem paths, and http transform URLs. (Board task
 * task_1791176003202_obsc.)
 */
function pipelineIo(pipeline: Pipeline): {
  envReads: string[];
  hosts: string[];
  dynamicHost: boolean;
} {
  const reads = new Set<string>();
  const hosts = new Set<string>();
  let dynamicHost = false;

  const requestField = (value: string | undefined) => {
    for (const name of envNamesIn(value)) reads.add(name);
    if (!value) return;
    const host = staticHostIn(value);
    if (host) hosts.add(host);
    else if (/^https?:\/\//i.test(value) || value.includes('${env.')) dynamicHost = true;
  };
  const fileField = (value: string | undefined) => {
    for (const name of envNamesIn(value)) reads.add(name);
  };

  for (const s of pipeline.sources) {
    if (s.type === 'rest' || s.type === 'stream' || s.type === 'webhook') requestField(s.endpoint);
    else if (s.type === 'filesystem') fileField(s.path);
  }
  for (const t of pipeline.transforms) {
    if (t.type === 'http') requestField(t.url);
  }
  for (const s of pipeline.sinks) {
    if (s.type === 'rest' || s.type === 'webhook') requestField(s.endpoint);
    else if (s.type === 'filesystem') fileField(s.path);
  }
  return { envReads: [...reads].sort(), hosts: [...hosts].sort(), dynamicHost };
}

/**
 * The env reads and request hosts a pipeline SOURCE declares, for `holoscript compile`
 * and reviewers — the same facts the generated module enforces at run time.
 */
export function summarizePipelineIo(source: string): {
  success: boolean;
  envReads: string[];
  hosts: string[];
  dynamicHost: boolean;
  errors?: string[];
} {
  const parsed = parsePipeline(source);
  if (!parsed.success || !parsed.pipeline) {
    return {
      success: false,
      envReads: [],
      hosts: [],
      dynamicHost: false,
      errors: parsed.errors.map((e) => e.message),
    };
  }
  return { success: true, ...pipelineIo(parsed.pipeline) };
}

export function compilePipelineToNode(
  pipeline: Pipeline,
  options: PipelineNodeCompilerOptions = {}
): string {
  const moduleName = options.moduleName || `${pipeline.name}.index.mjs`;
  const io = pipelineIo(pipeline);

  const sourceBlocks = pipeline.sources
    .map((s) => `datasets[${json(s.name)}] = ${emitSource(s)};`)
    .join('\n  ');

  const transformBlocks = pipeline.transforms.map((t) => emitTransform(t)).join('\n  ');
  const filterBlocks = pipeline.filters.map((f) => emitFilter(f)).join('\n  ');
  const validateBlocks = pipeline.validates.map((v) => emitValidate(v)).join('\n  ');
  const sinkBlocks = pipeline.sinks.map((s) => emitSink(s)).join('\n  ');

  return `/**
 * Generated by HoloScript PipelineNodeCompiler
 * Source pipeline: ${pipeline.name}
 * Output module: ${moduleName}
 *
 * Reads environment variables: ${io.envReads.length ? io.envReads.join(', ') : '(none)'}
 * Sends requests to: ${io.hosts.length ? io.hosts.join(', ') : '(no static hosts)'}${io.dynamicHost ? ' + host(s) from ${env.*}' : ''}
 *
 * Each ${'${env.NAME}'} the pipeline reads must be allowed by the operator at run time
 * (holoscript run --allow-env NAME, or HOLOSCRIPT_PIPELINE_ALLOW_ENV=NAME,NAME).
 * HOLOSCRIPT_MCP_URL is always allowed. (Board task task_1791176003202_obsc.)
 */

import fs from 'node:fs/promises';
import path from 'node:path';

const RUN_DATE = new Date().toISOString().slice(0, 10);

// The ${'${env.NAME}'} reads this pipeline makes, and the request hosts it targets,
// computed at compile time. The operator decides which env reads are allowed.
const PIPELINE_ENV_READS = ${JSON.stringify(io.envReads)};
const PIPELINE_REQUEST_HOSTS = ${JSON.stringify(io.hosts)};
const PIPELINE_HOST_FROM_ENV = ${JSON.stringify(io.dynamicHost)};
const PIPELINE_ALWAYS_ALLOWED_ENV = ${JSON.stringify(ALWAYS_ALLOWED_ENV)};

function pipelineAllowedEnv() {
  const raw = process.env.HOLOSCRIPT_PIPELINE_ALLOW_ENV || '';
  const set = new Set(raw.split(',').map((s) => s.trim()).filter(Boolean));
  set.add(PIPELINE_ALWAYS_ALLOWED_ENV);
  return set;
}

// Printed once at run start so an operator can see what the pipeline will read and
// where it will send, and catch an allowed secret heading to an unexpected host.
function announcePipelineIo() {
  const reads = PIPELINE_ENV_READS.length ? PIPELINE_ENV_READS.join(', ') : '(none)';
  const hosts =
    (PIPELINE_REQUEST_HOSTS.length ? PIPELINE_REQUEST_HOSTS.join(', ') : '(no static hosts)') +
    (PIPELINE_HOST_FROM_ENV ? ' + host(s) from \${env.*}' : '');
  console.error('[pipeline] reads env: ' + reads + '; sends requests to: ' + hosts);
}

// Refuse the whole run, before any request or file write, if the pipeline reads an
// environment variable the operator has not allowed.
function assertPipelineEnvAllowed() {
  const allowed = pipelineAllowedEnv();
  const denied = PIPELINE_ENV_READS.filter((name) => !allowed.has(name));
  if (denied.length === 0) return;
  const flags = denied.map((n) => '--allow-env ' + n).join(' ');
  throw new Error(
    'This pipeline reads the environment variable' +
      (denied.length > 1 ? 's ' : ' ') +
      denied.map((n) => '"' + n + '"').join(', ') +
      ', which you have not allowed. Re-run with  ' +
      flags +
      '  (one per variable), or set HOLOSCRIPT_PIPELINE_ALLOW_ENV=' +
      denied.join(',') +
      '. Only ' +
      PIPELINE_ALWAYS_ALLOWED_ENV +
      ' is readable without a flag.'
  );
}

function resolveTemplate(value, context = {}) {
  if (typeof value !== 'string') return value;
  return value
    .replace(/\\$\\{date\\}/g, RUN_DATE)
    .replace(/\\$\\{env\\.([A-Za-z_][A-Za-z0-9_]*)\\}/g, (_match, name) => process.env[name] ?? '')
    .replace(/\\$\\{([A-Za-z_][A-Za-z0-9_.]*)\\}/g, (_match, key) => {
      const found = key.split('.').reduce((acc, part) => (acc && typeof acc === 'object' ? acc[part] : undefined), context);
      return found === undefined || found === null ? '' : String(found);
    });
}

function normalizeOutputPath(rawPath, format) {
  const resolved = resolveTemplate(rawPath);
  if (!resolved) return format === 'json' ? './pipeline-output.json' : './pipeline-output.jsonl';
  if (path.extname(resolved)) return resolved;
  return path.join(resolved, format === 'json' ? 'pipeline-output.json' : 'pipeline-output.jsonl');
}

async function fetchJSON(url, init) {
  const resolvedUrl = resolveTemplate(url);
  if (!resolvedUrl) return [];
  const res = await fetch(resolvedUrl, init);
  if (!res.ok) throw new Error(\`Request failed: \${res.status} \${res.statusText}\`);
  const body = await res.json();
  return Array.isArray(body) ? body : [body];
}

async function postJSON(url, data, init) {
  const resolvedUrl = resolveTemplate(url, { data });
  if (!resolvedUrl) {
    console.warn('[PipelineNodeCompiler] skipping empty webhook/rest sink endpoint');
    return;
  }
  const res = await fetch(resolvedUrl, {
    ...init,
    headers: { 'content-type': 'application/json', ...(init?.headers || {}) },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error(\`Request failed: \${res.status} \${res.statusText}\`);
}

async function readJSONArray(filePath) {
  const resolvedPath = resolveTemplate(filePath);
  if (!resolvedPath) return [];
  const raw = await fs.readFile(resolvedPath, 'utf8');
  const parsed = JSON.parse(raw);
  return Array.isArray(parsed) ? parsed : [parsed];
}

function applyTransforms(value, transforms) {
  let v = value;
  for (const t of transforms) {
    if (t === 'trim()' && typeof v === 'string') v = v.trim();
    else if (t === 'titleCase()' && typeof v === 'string') v = v.replace(/\\b\\w/g, (m) => m.toUpperCase());
    else if (/^multiply\\((\\d+(?:\\.\\d+)?)\\)$/.test(t) && typeof v === 'number') {
      const m = t.match(/^multiply\\((\\d+(?:\\.\\d+)?)\\)$/);
      v = v * Number(m?.[1] || 1);
    }
  }
  return v;
}

function getPathValue(item, pathExpr) {
  const cleanPath = String(pathExpr || '').replace(/\\[\\]$/, '');
  if (!cleanPath) return item;
  return cleanPath.split('.').reduce((acc, part) => {
    if (acc == null || typeof acc !== 'object') return undefined;
    return acc[part];
  }, item);
}

function unwrapPathValues(item, pathExpr) {
  const value = getPathValue(item, pathExpr);
  if (Array.isArray(value)) return value;
  if (value == null) return [];
  return [value];
}

function evalCondition(item, condition) {
  try {
    const fn = new Function('item', \`with (item) { return (\${condition}); }\`);
    return Boolean(fn(item));
  } catch {
    return false;
  }
}

function validateItem(item, fields) {
  for (const f of fields) {
    const val = item[f.field];
    const rules = f.rules || [];
    if (rules.includes('required') && (val === undefined || val === null || val === '')) return false;
    if (rules.includes('integer') && val !== undefined && !Number.isInteger(val)) return false;
    if (rules.includes('string') && val !== undefined && typeof val !== 'string') return false;
  }
  return true;
}

async function writeOutput(rawPath, data, format, append) {
  const outputPath = normalizeOutputPath(rawPath, format);
  await fs.mkdir(path.dirname(outputPath), { recursive: true });

  if (format === 'json') {
    const text = JSON.stringify(data, null, 2);
    if (append) await fs.appendFile(outputPath, text + '\\n');
    else await fs.writeFile(outputPath, text);
    return;
  }

  const lines = data.map((d) => JSON.stringify(d)).join('\\n') + '\\n';
  if (append) await fs.appendFile(outputPath, lines);
  else await fs.writeFile(outputPath, lines);
}

export async function runPipeline() {
  // Run start: declare the pipeline's env reads and hosts, then refuse any env read
  // the operator has not allowed — before the first request or file write.
  announcePipelineIo();
  assertPipelineEnvAllowed();
  const datasets = {};
  ${sourceBlocks}

  let data = Object.values(datasets).flat();

  ${transformBlocks}
  ${filterBlocks}
  ${validateBlocks}
  ${sinkBlocks}

  return { count: data.length, data };
}

if (process.argv[1] && import.meta.url === new URL(process.argv[1], 'file:').href) {
  runPipeline().then((r) => {
    console.log(\`Pipeline completed: \${r.count} records\`);
  }).catch((err) => {
    console.error(err);
    process.exitCode = 1;
  });
}
`;
}

export function compilePipelineToPython(
  pipeline: Pipeline,
  options: PipelinePythonCompilerOptions = {}
): string {
  const moduleName = options.moduleName || `${pipeline.name}.py`;

  const sourceBlocks = pipeline.sources.map((s) => emitPythonSource(s)).join('\n    ');

  const transformBlocks = pipeline.transforms.map((t) => emitPythonTransform(t)).join('\n    ');
  const filterBlocks = pipeline.filters.map((f) => emitPythonFilter(f)).join('\n    ');
  const validateBlocks = pipeline.validates.map((v) => emitPythonValidate(v)).join('\n    ');
  const sinkBlocks = pipeline.sinks.map((s) => emitPythonSink(s)).join('\n    ');

  const schedulerBlock = pipeline.schedule
    ? `scheduler = AsyncIOScheduler()\n    scheduler.add_job(run_pipeline, trigger=CronTrigger.from_crontab(${json(pipeline.schedule)}))\n    scheduler.start()\n    print(${json(`[${pipeline.name}] scheduled: ${pipeline.schedule}`)})\n\n    try:\n        while True:\n            await asyncio.sleep(3600)\n    except (KeyboardInterrupt, SystemExit):\n        scheduler.shutdown()`
    : 'await run_pipeline()';

  return `"""\nGenerated by HoloScript PipelinePythonCompiler\nSource pipeline: ${pipeline.name}\nOutput module: ${moduleName}\n\nRuntime deps:\n  pip install apscheduler\n"""\n\nimport asyncio\nimport json\nfrom urllib.request import Request, urlopen\nfrom urllib.error import HTTPError, URLError\nfrom apscheduler.schedulers.asyncio import AsyncIOScheduler\nfrom apscheduler.triggers.cron import CronTrigger\n\n\ndef _request_json(url: str, method: str = 'GET', payload=None):\n    if not url:\n        return []\n\n    data = None\n    headers = {'Content-Type': 'application/json'}\n    if payload is not None:\n        data = json.dumps(payload).encode('utf-8')\n\n    req = Request(url, data=data, method=method, headers=headers)\n    try:\n        with urlopen(req, timeout=30) as res:\n            body = res.read().decode('utf-8')\n            parsed = json.loads(body) if body else []\n            return parsed if isinstance(parsed, list) else [parsed]\n    except (HTTPError, URLError, TimeoutError) as err:\n        raise RuntimeError(f'Request failed: {err}')\n\n\nasync def fetch_json(url: str, method: str = 'GET'):\n    return await asyncio.to_thread(_request_json, url, method, None)\n\n\nasync def post_json(url: str, payload, method: str = 'POST'):\n    return await asyncio.to_thread(_request_json, url, method, payload)\n\n\nasync def read_json_array(file_path: str):\n    if not file_path:\n        return []\n\n    def _read():\n        with open(file_path, 'r', encoding='utf-8') as f:\n            parsed = json.load(f)\n            return parsed if isinstance(parsed, list) else [parsed]\n\n    return await asyncio.to_thread(_read)\n\n\ndef apply_transforms(value, transforms):\n    v = value\n    for t in transforms:\n        if t == 'trim()' and isinstance(v, str):\n            v = v.strip()\n        elif t == 'titleCase()' and isinstance(v, str):\n            v = ' '.join(part.capitalize() for part in v.split(' '))\n        elif t.startswith('multiply(') and t.endswith(')') and isinstance(v, (int, float)):\n            try:\n                factor = float(t[len('multiply('):-1])\n            except ValueError:\n                factor = 1.0\n            v = v * factor\n    return v\n\n\ndef eval_condition(item, condition: str):\n    try:\n        return bool(eval(condition, {'__builtins__': {}}, dict(item)))\n    except Exception:\n        return False\n\n\ndef validate_item(item, fields):\n    for f in fields:\n        key = f.get('field')\n        rules = f.get('rules', [])\n        val = item.get(key) if isinstance(item, dict) else None\n\n        if 'required' in rules and (val is None or val == ''):\n            return False\n        if 'integer' in rules and val is not None and not isinstance(val, int):\n            return False\n        if 'string' in rules and val is not None and not isinstance(val, str):\n            return False\n\n    return True\n\n\nasync def write_output(path: str, data, fmt: str, append: bool):\n    if fmt == 'json':\n        text = json.dumps(data, indent=2)\n        mode = 'a' if append else 'w'\n\n        def _write_json():\n            with open(path, mode, encoding='utf-8') as f:\n                f.write(text + ('\\n' if append else ''))\n\n        await asyncio.to_thread(_write_json)\n        return\n\n    lines = ''.join(json.dumps(d) + '\\n' for d in data)\n    mode = 'a' if append else 'w'\n\n    def _write_jsonl():\n        with open(path, mode, encoding='utf-8') as f:\n            f.write(lines)\n\n    await asyncio.to_thread(_write_jsonl)\n\n\nasync def run_pipeline():\n    datasets = {}\n    ${sourceBlocks}\n\n    data = []\n    for records in datasets.values():\n        if isinstance(records, list):\n            data.extend(records)\n        else:\n            data.append(records)\n\n    ${transformBlocks}\n    ${filterBlocks}\n    ${validateBlocks}\n    ${sinkBlocks}\n\n    return {'count': len(data), 'data': data}\n\n\nasync def main():\n    ${schedulerBlock}\n\n\nif __name__ == '__main__':\n    asyncio.run(main())\n`;
}

export function compilePipelineSourceToNode(
  source: string,
  options: PipelineNodeCompilerOptions = {}
): { success: boolean; code?: string; errors?: string[] } {
  const parsed = parsePipeline(source);
  if (!parsed.success || !parsed.pipeline) {
    return {
      success: false,
      errors: parsed.errors.map((e) => e.message),
    };
  }

  return {
    success: true,
    code: compilePipelineToNode(parsed.pipeline, options),
  };
}

export function compilePipelineSourceToPython(
  source: string,
  options: PipelinePythonCompilerOptions = {}
): { success: boolean; code?: string; errors?: string[] } {
  const parsed = parsePipeline(source);
  if (!parsed.success || !parsed.pipeline) {
    return {
      success: false,
      errors: parsed.errors.map((e) => e.message),
    };
  }

  return {
    success: true,
    code: compilePipelineToPython(parsed.pipeline, options),
  };
}

export function compilePipelineSource(
  source: string,
  options: PipelineCompilerOptions = {}
): { success: boolean; code?: string; errors?: string[] } {
  const target = options.target || 'node';

  if (target === 'python') {
    return compilePipelineSourceToPython(source, options.python);
  }

  return compilePipelineSourceToNode(source, options.node);
}
