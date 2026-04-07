import { describe, it, expect } from 'vitest';
import { parsePipeline, isPipelineSource } from '../PipelineParser';

describe('PipelineParser', () => {
  describe('isPipelineSource', () => {
    it('detects pipeline keyword', () => {
      expect(isPipelineSource('pipeline "Test" { }')).toBe(true);
      expect(isPipelineSource('pipeline Foo { }')).toBe(true);
      expect(isPipelineSource('object "Cube" { }')).toBe(false);
    });
  });

  describe('minimal pipeline', () => {
    it('parses pipeline with one source and one sink', () => {
      const result = parsePipeline(`
        pipeline "BasicSync" {
          schedule: "*/5 * * * *"

          source API {
            type: "rest"
            endpoint: "https://api.example.com/data"
            method: "GET"
          }

          sink DB {
            type: "database"
            endpoint: "postgres://localhost/mydb"
          }
        }
      `);

      expect(result.success).toBe(true);
      expect(result.pipeline!.name).toBe('BasicSync');
      expect(result.pipeline!.schedule).toBe('*/5 * * * *');
      expect(result.pipeline!.sources).toHaveLength(1);
      expect(result.pipeline!.sources[0].name).toBe('API');
      expect(result.pipeline!.sources[0].type).toBe('rest');
      expect(result.pipeline!.sources[0].endpoint).toBe('https://api.example.com/data');
      expect(result.pipeline!.sinks).toHaveLength(1);
      expect(result.pipeline!.sinks[0].name).toBe('DB');
    });
  });

  describe('transform blocks', () => {
    it('parses field mappings with transform chains', () => {
      const result = parsePipeline(`
        pipeline "FieldMap" {
          source In {
            type: "rest"
            endpoint: "https://api.test.com"
          }

          transform MapFields {
            sku -> productId
            qty -> stock
            name -> displayName : trim() : titleCase()
            cost -> costCents : multiply(100)
          }

          sink Out {
            type: "rest"
            endpoint: "https://api.dest.com"
          }
        }
      `);

      expect(result.success).toBe(true);
      const t = result.pipeline!.transforms[0];
      expect(t.name).toBe('MapFields');
      expect(t.type).toBe('field_mapping');
      expect(t.mappings).toHaveLength(4);
      expect(t.mappings![0]).toEqual({ from: 'sku', to: 'productId', transforms: [] });
      expect(t.mappings![1]).toEqual({ from: 'qty', to: 'stock', transforms: [] });
      expect(t.mappings![2]).toEqual({
        from: 'name',
        to: 'displayName',
        transforms: ['trim()', 'titleCase()'],
      });
      expect(t.mappings![3]).toEqual({
        from: 'cost',
        to: 'costCents',
        transforms: ['multiply(100)'],
      });
    });

    it('parses LLM transform', () => {
      const result = parsePipeline(`
        pipeline "Classify" {
          source In { type: "rest" endpoint: "https://x.com" }

          transform Categorize {
            type: "llm"
            model: "claude-sonnet-4-6"
            input: content
            output: category
          }

          sink Out { type: "stdout" }
        }
      `);

      expect(result.success).toBe(true);
      const t = result.pipeline!.transforms[0];
      expect(t.type).toBe('llm');
      expect(t.model).toBe('claude-sonnet-4-6');
      expect(t.input).toBe('content');
    });

    it('parses MCP tool transform', () => {
      const result = parsePipeline(`
        pipeline "Enrich" {
          source In { type: "rest" endpoint: "https://x.com" }

          transform Query {
            type: "mcp"
            server: "mcp-orchestrator"
            tool: "knowledge_query"
          }

          sink Out { type: "stdout" }
        }
      `);

      expect(result.success).toBe(true);
      const t = result.pipeline!.transforms[0];
      expect(t.type).toBe('mcp');
      expect(t.server).toBe('mcp-orchestrator');
      expect(t.tool).toBe('knowledge_query');
    });
  });

  describe('filter blocks', () => {
    it('parses filter with where clause', () => {
      const result = parsePipeline(`
        pipeline "FilterTest" {
          source In { type: "rest" endpoint: "https://x.com" }

          filter Active {
            where: stock > 0 && status == "active"
          }

          sink Out { type: "stdout" }
        }
      `);

      expect(result.success).toBe(true);
      expect(result.pipeline!.filters).toHaveLength(1);
      expect(result.pipeline!.filters[0].name).toBe('Active');
      expect(result.pipeline!.filters[0].where).toContain('stock > 0');
    });

    it('reports error for filter without where', () => {
      const result = parsePipeline(`
        pipeline "Bad" {
          source In { type: "rest" endpoint: "https://x.com" }
          filter Oops { }
          sink Out { type: "stdout" }
        }
      `);

      expect(result.errors.some((e) => e.message.includes('missing'))).toBe(true);
    });
  });

  describe('validate blocks', () => {
    it('parses validation rules', () => {
      const result = parsePipeline(`
        pipeline "ValidateTest" {
          source In { type: "rest" endpoint: "https://x.com" }

          validate Order {
            productId : required, string, minLength(3)
            quantity : required, integer, min(1), max(10000)
            email : optional, string
          }

          sink Out { type: "stdout" }
        }
      `);

      expect(result.success).toBe(true);
      const v = result.pipeline!.validates[0];
      expect(v.name).toBe('Order');
      expect(v.fields).toHaveLength(3);
      expect(v.fields[0].field).toBe('productId');
      expect(v.fields[0].rules).toEqual(['required', 'string', 'minLength(3)']);
      expect(v.fields[1].rules).toContain('integer');
      expect(v.fields[2].rules).toContain('optional');
    });
  });

  describe('merge blocks', () => {
    it('parses merge with dedup', () => {
      const result = parsePipeline(`
        pipeline "MergeTest" {
          source A { type: "rest" endpoint: "https://a.com" }
          source B { type: "rest" endpoint: "https://b.com" }

          merge Combined {
            from: [A, B]
            strategy: "concat"
          }

          sink Out { type: "stdout" }
        }
      `);

      expect(result.success).toBe(true);
      expect(result.pipeline!.sources).toHaveLength(2);
      expect(result.pipeline!.merges).toHaveLength(1);
      expect(result.pipeline!.merges[0].from).toEqual(['A', 'B']);
      expect(result.pipeline!.merges[0].strategy).toBe('concat');
    });
  });

  describe('branch blocks', () => {
    it('parses conditional routing', () => {
      const result = parsePipeline(`
        pipeline "BranchTest" {
          source In { type: "rest" endpoint: "https://x.com" }

          branch Route {
            when category == "bug" -> sink GitHub
            when category == "question" -> sink FAQ
            default -> sink Log
          }

          sink GitHub { type: "rest" endpoint: "https://api.github.com" }
          sink FAQ { type: "mcp" server: "knowledge" tool: "query" }
          sink Log { type: "filesystem" path: "/var/log/events.jsonl" }
        }
      `);

      expect(result.success).toBe(true);
      const b = result.pipeline!.branches[0];
      expect(b.routes).toHaveLength(3);
      expect(b.routes[0]).toEqual({ condition: 'category == "bug"', sinkName: 'GitHub' });
      expect(b.routes[1]).toEqual({ condition: 'category == "question"', sinkName: 'FAQ' });
      expect(b.routes[2]).toEqual({ condition: 'default', sinkName: 'Log' });
    });
  });

  describe('sink blocks', () => {
    it('parses sink with batch and error handling', () => {
      const result = parsePipeline(`
        pipeline "SinkTest" {
          source In { type: "rest" endpoint: "https://x.com" }

          sink API {
            type: "rest"
            endpoint: "https://api.dest.com/bulk"
            method: "POST"
            format: "json"
          }
        }
      `);

      expect(result.success).toBe(true);
      const s = result.pipeline!.sinks[0];
      expect(s.type).toBe('rest');
      expect(s.method).toBe('POST');
      expect(s.format).toBe('json');
    });

    it('parses filesystem sink', () => {
      const result = parsePipeline(`
        pipeline "FileTest" {
          source In { type: "rest" endpoint: "https://x.com" }

          sink Audit {
            type: "filesystem"
            path: "/var/log/audit.jsonl"
            format: "jsonl"
            append: true
          }
        }
      `);

      expect(result.success).toBe(true);
      const s = result.pipeline!.sinks[0];
      expect(s.type).toBe('filesystem');
      expect(s.path).toBe('/var/log/audit.jsonl');
      expect(s.append).toBe(true);
    });
  });

  describe('full pipeline', () => {
    it('parses inventory sync pipeline', () => {
      const result = parsePipeline(`
        pipeline "InventorySync" {
          schedule: "*/5 * * * *"
          timeout: 30s

          source POS {
            type: "rest"
            endpoint: "https://pos.example.com/products"
            method: "GET"
          }

          transform MapFields {
            sku -> productId
            qty -> stock
            name -> displayName : trim()
          }

          filter StockChanged {
            where: stock != previous.stock
          }

          validate Inventory {
            productId : required, string
            stock : required, integer, min(0)
          }

          sink Storefront {
            type: "rest"
            endpoint: "https://store.example.com/inventory"
            method: "PATCH"
          }

          sink Analytics {
            type: "webhook"
            endpoint: "https://hooks.example.com/events"
            method: "POST"
          }
        }
      `);

      expect(result.success).toBe(true);
      const p = result.pipeline!;
      expect(p.name).toBe('InventorySync');
      expect(p.schedule).toBe('*/5 * * * *');
      expect(p.sources).toHaveLength(1);
      expect(p.transforms).toHaveLength(1);
      expect(p.filters).toHaveLength(1);
      expect(p.validates).toHaveLength(1);
      expect(p.sinks).toHaveLength(2);
      expect(p.steps).toHaveLength(6); // 1 source + 1 transform + 1 filter + 1 validate + 2 sinks
    });
  });

  describe('error handling', () => {
    it('fails on missing pipeline block', () => {
      const result = parsePipeline('object "Cube" { }');
      expect(result.success).toBe(false);
      expect(result.errors[0].message).toBe('No pipeline block found');
    });

    it('reports missing sources', () => {
      const result = parsePipeline(`
        pipeline "NoSource" {
          sink Out { type: "stdout" }
        }
      `);

      expect(result.success).toBe(false);
      expect(result.errors.some((e) => e.message.includes('no sources'))).toBe(true);
    });

    it('reports missing sinks', () => {
      const result = parsePipeline(`
        pipeline "NoSink" {
          source In { type: "rest" endpoint: "https://x.com" }
        }
      `);

      expect(result.success).toBe(false);
      expect(result.errors.some((e) => e.message.includes('no sinks'))).toBe(true);
    });
  });

  describe('source types', () => {
    it('parses filesystem source', () => {
      const result = parsePipeline(`
        pipeline "FileSource" {
          source Logs {
            type: "filesystem"
            path: "/var/log/app/"
            pattern: "*.jsonl"
            since: "24h"
          }

          sink Out { type: "stdout" }
        }
      `);

      expect(result.success).toBe(true);
      const s = result.pipeline!.sources[0];
      expect(s.type).toBe('filesystem');
      expect(s.path).toBe('/var/log/app/');
      expect(s.pattern).toBe('*.jsonl');
      expect(s.since).toBe('24h');
    });

    it('parses MCP source', () => {
      const result = parsePipeline(`
        pipeline "MCPSource" {
          source Knowledge {
            type: "mcp"
            server: "mcp-orchestrator"
            tool: "knowledge_query"
          }

          sink Out { type: "stdout" }
        }
      `);

      expect(result.success).toBe(true);
      expect(result.pipeline!.sources[0].type).toBe('mcp');
    });
  });
});
