import { describe, expect, it } from 'vitest';
import { compilePipelineSourceToNode } from '../PipelineCompiler';

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
    expect(result.code).toContain('await DbIn_client.query(interpolate(`SELECT id, stock FROM inventory`));');
    expect(result.code).toContain("INSERT INTO inventory_events (payload) VALUES ($1)");
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
    expect(result.code).toContain("name: \"knowledge_write\"");
    expect(result.code).toContain('await ToolOut_invoke(records);');
    expect(result.code).not.toContain('// TODO: mcp sink not yet compiled');
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
    expect(result.code).toContain("const PullData_url = PullData_base.replace(/\\/$/, '') + '/mcp';");
    expect(result.code).toContain("method: 'tools/call'");
    expect(result.code).toContain("name: \"knowledge_query\"");
    expect(result.code).toContain('const PullData_content = PullData_json?.result?.content;');
    expect(result.code).not.toContain('// TODO: mcp source not yet compiled');
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
    expect(result.code).toContain("name: \"knowledge_enrich\"");
    expect(result.code).toContain('arguments: { ...{"namespace":"products","limit":5}, records, output },');
    expect(result.code).toContain('const Enrich_content = Enrich_json?.result?.content;');
    expect(result.code).not.toContain("// TODO: mcp transform not yet compiled");
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
    expect(result.code).toContain("const Events_resp = await fetch(interpolate(");
    expect(result.code).toContain("EVENTS_URL:-https://api.example.com/events");
    expect(result.code).toContain("const Events_text = await Events_resp.text();");
    expect(result.code).toContain("data: '");
    expect(result.code).not.toContain("// TODO: stream source not yet compiled");
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
    expect(result.code).toContain("const Summarise_model = interpolate(`gpt-4o-mini`)");
    expect(result.code).toContain("const Summarise_apiKey = process.env.OPENAI_API_KEY");
    expect(result.code).toContain("/chat/completions");
    expect(result.code).toContain('"Summarize: {{input}}"');
    expect(result.code).toContain('"title"');
    expect(result.code).toContain('"summary"');
    expect(result.code).toContain("records = Summarise_results;");
    expect(result.code).not.toContain("// TODO: llm transform not yet compiled");
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
    expect(result.code).toContain("const Enrich_results = [];");
    expect(result.code).toContain("for (const r of records)");
    expect(result.code).toContain("ENRICH_API:-https://api.example.com/enrich");
    expect(result.code).toContain("method: 'POST'");
    expect(result.code).toContain("records = Enrich_results;");
    expect(result.code).not.toContain("// TODO: http transform not yet compiled");
  });
});
