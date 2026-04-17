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
});
