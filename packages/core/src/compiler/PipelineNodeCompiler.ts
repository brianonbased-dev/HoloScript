/**
 * PipelineNodeCompiler
 *
 * Compiles a parsed .hs pipeline AST into a runnable Node.js ESM module.
 */

import { parsePipeline, type Pipeline, type PipelineFilter, type PipelineTransform, type PipelineValidate, type PipelineSink, type PipelineSource } from '../parser/PipelineParser';

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
      return '[]';
  }
}

function emitFieldMappingTransform(t: PipelineTransform): string {
  const mappings = t.mappings || [];
  const mapExpr = mappings
    .map((m) => `${json(m.to)}: applyTransforms(item[${json(m.from)}], ${json(m.transforms || [])})`)
    .join(',\n      ');

  return `data = data.map((item) => ({\n      ${mapExpr}\n    }));`;
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
      return `await fetch(${json(sink.endpoint || '')}, { method: ${json(sink.method || 'POST')}, headers: { 'content-type': 'application/json' }, body: JSON.stringify(data) });`;
    case 'mcp':
      return `console.warn(${json(`[${sink.name}] mcp sink requires host integration: ${sink.server || ''}/${sink.tool || ''}`)});`;
    default:
      return `// sink ${sink.name} (${sink.type}) not implemented`;
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
      return `datasets[${json(source.name)}] = []`;
  }
}

function emitPythonFieldMappingTransform(t: PipelineTransform): string {
  const mappings = t.mappings || [];
  const mappingLines = mappings
    .map((m) => `${json(m.to)}: apply_transforms(item.get(${json(m.from)}), ${json(m.transforms || [])}),`)
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
      return `# sink ${sink.name} (${sink.type}) not implemented`;
  }
}

export function compilePipelineToNode(pipeline: Pipeline, options: PipelineNodeCompilerOptions = {}): string {
  const moduleName = options.moduleName || `${pipeline.name}.index.mjs`;

  const sourceBlocks = pipeline.sources
    .map((s) => `datasets[${json(s.name)}] = ${emitSource(s)};`)
    .join('\n  ');

  const transformBlocks = pipeline.transforms.map((t) => emitTransform(t)).join('\n  ');
  const filterBlocks = pipeline.filters.map((f) => emitFilter(f)).join('\n  ');
  const validateBlocks = pipeline.validates.map((v) => emitValidate(v)).join('\n  ');
  const sinkBlocks = pipeline.sinks.map((s) => emitSink(s)).join('\n  ');

  return `/**\n * Generated by HoloScript PipelineNodeCompiler\n * Source pipeline: ${pipeline.name}\n * Output module: ${moduleName}\n */\n\nimport fs from 'node:fs/promises';\n\nasync function fetchJSON(url, init) {\n  if (!url) return [];\n  const res = await fetch(url, init);\n  if (!res.ok) throw new Error(\`Request failed: \${res.status} \${res.statusText}\`);\n  const body = await res.json();\n  return Array.isArray(body) ? body : [body];\n}\n\nasync function readJSONArray(filePath) {\n  if (!filePath) return [];\n  const raw = await fs.readFile(filePath, 'utf8');\n  const parsed = JSON.parse(raw);\n  return Array.isArray(parsed) ? parsed : [parsed];\n}\n\nfunction applyTransforms(value, transforms) {\n  let v = value;\n  for (const t of transforms) {\n    if (t === 'trim()' && typeof v === 'string') v = v.trim();\n    else if (t === 'titleCase()' && typeof v === 'string') v = v.replace(/\\b\\w/g, (m) => m.toUpperCase());\n    else if (/^multiply\\((\\d+(?:\\.\\d+)?)\\)$/.test(t) && typeof v === 'number') {\n      const m = t.match(/^multiply\\((\\d+(?:\\.\\d+)?)\\)$/);\n      v = v * Number(m?.[1] || 1);\n    }\n  }\n  return v;\n}\n\nfunction evalCondition(item, condition) {\n  try {\n    const fn = new Function('item', \`with (item) { return (\${condition}); }\`);\n    return Boolean(fn(item));\n  } catch {\n    return false;\n  }\n}\n\nfunction validateItem(item, fields) {\n  for (const f of fields) {\n    const val = item[f.field];\n    const rules = f.rules || [];\n    if (rules.includes('required') && (val === undefined || val === null || val === '')) return false;\n    if (rules.includes('integer') && val !== undefined && !Number.isInteger(val)) return false;\n    if (rules.includes('string') && val !== undefined && typeof val !== 'string') return false;\n  }\n  return true;\n}\n\nasync function writeOutput(path, data, format, append) {\n  if (format === 'json') {\n    const text = JSON.stringify(data, null, 2);\n    if (append) await fs.appendFile(path, text + '\\n');\n    else await fs.writeFile(path, text);\n    return;\n  }\n\n  const lines = data.map((d) => JSON.stringify(d)).join('\\n') + '\\n';\n  if (append) await fs.appendFile(path, lines);\n  else await fs.writeFile(path, lines);\n}\n\nexport async function runPipeline() {\n  const datasets = {};\n  ${sourceBlocks}\n\n  let data = Object.values(datasets).flat();\n\n  ${transformBlocks}\n  ${filterBlocks}\n  ${validateBlocks}\n  ${sinkBlocks}\n\n  return { count: data.length, data };\n}\n\nif (process.argv[1] && import.meta.url === new URL(process.argv[1], 'file:').href) {\n  runPipeline().then((r) => {\n    console.log(\`Pipeline completed: \${r.count} records\`);\n  }).catch((err) => {\n    console.error(err);\n    process.exitCode = 1;\n  });\n}\n`;
}

export function compilePipelineToPython(pipeline: Pipeline, options: PipelinePythonCompilerOptions = {}): string {
  const moduleName = options.moduleName || `${pipeline.name}.py`;

  const sourceBlocks = pipeline.sources
    .map((s) => emitPythonSource(s))
    .join('\n    ');

  const transformBlocks = pipeline.transforms.map((t) => emitPythonTransform(t)).join('\n    ');
  const filterBlocks = pipeline.filters.map((f) => emitPythonFilter(f)).join('\n    ');
  const validateBlocks = pipeline.validates.map((v) => emitPythonValidate(v)).join('\n    ');
  const sinkBlocks = pipeline.sinks.map((s) => emitPythonSink(s)).join('\n    ');

  const schedulerBlock = pipeline.schedule
    ? `scheduler = AsyncIOScheduler()\n    scheduler.add_job(run_pipeline, trigger=CronTrigger.from_crontab(${json(pipeline.schedule)}))\n    scheduler.start()\n    print(${json(`[${pipeline.name}] scheduled: ${pipeline.schedule}`)})\n\n    try:\n        while True:\n            await asyncio.sleep(3600)\n    except (KeyboardInterrupt, SystemExit):\n        scheduler.shutdown()`
    : 'await run_pipeline()';

  return `"""\nGenerated by HoloScript PipelinePythonCompiler\nSource pipeline: ${pipeline.name}\nOutput module: ${moduleName}\n\nRuntime deps:\n  pip install apscheduler\n"""\n\nimport asyncio\nimport json\nfrom urllib.request import Request, urlopen\nfrom urllib.error import HTTPError, URLError\nfrom apscheduler.schedulers.asyncio import AsyncIOScheduler\nfrom apscheduler.triggers.cron import CronTrigger\n\n\ndef _request_json(url: str, method: str = 'GET', payload=None):\n    if not url:\n        return []\n\n    data = None\n    headers = {'Content-Type': 'application/json'}\n    if payload is not None:\n        data = json.dumps(payload).encode('utf-8')\n\n    req = Request(url, data=data, method=method, headers=headers)\n    try:\n        with urlopen(req, timeout=30) as res:\n            body = res.read().decode('utf-8')\n            parsed = json.loads(body) if body else []\n            return parsed if isinstance(parsed, list) else [parsed]\n    except (HTTPError, URLError, TimeoutError) as err:\n        raise RuntimeError(f'Request failed: {err}')\n\n\nasync def fetch_json(url: str, method: str = 'GET'):\n    return await asyncio.to_thread(_request_json, url, method, None)\n\n\nasync def post_json(url: str, payload, method: str = 'POST'):\n    return await asyncio.to_thread(_request_json, url, method, payload)\n\n\nasync def read_json_array(file_path: str):\n    if not file_path:\n        return []\n\n    def _read():\n        with open(file_path, 'r', encoding='utf-8') as f:\n            parsed = json.load(f)\n            return parsed if isinstance(parsed, list) else [parsed]\n\n    return await asyncio.to_thread(_read)\n\n\ndef apply_transforms(value, transforms):\n    v = value\n    for t in transforms:\n        if t == 'trim()' and isinstance(v, str):\n            v = v.strip()\n        elif t == 'titleCase()' and isinstance(v, str):\n            v = ' '.join(part.capitalize() for part in v.split(' '))\n        elif t.startswith('multiply(') and t.endswith(')') and isinstance(v, (int, float)):\n            try:\n                factor = float(t[len('multiply('):-1])\n            except ValueError:\n                factor = 1.0\n            v = v * factor\n    return v\n\n\ndef eval_condition(item, condition: str):\n    try:\n        return bool(eval(condition, {'__builtins__': {}}, dict(item)))\n    except Exception:\n        return False\n\n\ndef validate_item(item, fields):\n    for f in fields:\n        key = f.get('field')\n        rules = f.get('rules', [])\n        val = item.get(key) if isinstance(item, dict) else None\n\n        if 'required' in rules and (val is None or val == ''):\n            return False\n        if 'integer' in rules and val is not None and not isinstance(val, int):\n            return False\n        if 'string' in rules and val is not None and not isinstance(val, str):\n            return False\n\n    return True\n\n\nasync def write_output(path: str, data, fmt: str, append: bool):\n    if fmt == 'json':\n        text = json.dumps(data, indent=2)\n        mode = 'a' if append else 'w'\n\n        def _write_json():\n            with open(path, mode, encoding='utf-8') as f:\n                f.write(text + ('\\n' if append else ''))\n\n        await asyncio.to_thread(_write_json)\n        return\n\n    lines = ''.join(json.dumps(d) + '\\n' for d in data)\n    mode = 'a' if append else 'w'\n\n    def _write_jsonl():\n        with open(path, mode, encoding='utf-8') as f:\n            f.write(lines)\n\n    await asyncio.to_thread(_write_jsonl)\n\n\nasync def run_pipeline():\n    datasets = {}\n    ${sourceBlocks}\n\n    data = []\n    for records in datasets.values():\n        if isinstance(records, list):\n            data.extend(records)\n        else:\n            data.append(records)\n\n    ${transformBlocks}\n    ${filterBlocks}\n    ${validateBlocks}\n    ${sinkBlocks}\n\n    return {'count': len(data), 'data': data}\n\n\nasync def main():\n    ${schedulerBlock}\n\n\nif __name__ == '__main__':\n    asyncio.run(main())\n`;
}

export function compilePipelineSourceToNode(source: string, options: PipelineNodeCompilerOptions = {}): { success: boolean; code?: string; errors?: string[] } {
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

export function compilePipelineSourceToPython(source: string, options: PipelinePythonCompilerOptions = {}): { success: boolean; code?: string; errors?: string[] } {
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

export function compilePipelineSource(source: string, options: PipelineCompilerOptions = {}): { success: boolean; code?: string; errors?: string[] } {
  const target = options.target || 'node';

  if (target === 'python') {
    return compilePipelineSourceToPython(source, options.python);
  }

  return compilePipelineSourceToNode(source, options.node);
}
