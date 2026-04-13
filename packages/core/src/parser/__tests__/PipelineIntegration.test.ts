import { describe, it, expect } from 'vitest';
import { parseHolo } from '../HoloCompositionParser';

describe('Pipeline integration in .holo files', () => {
  it('parses inline pipeline block with structured AST', () => {
    const result = parseHolo(`
      composition "Dispensary" {
        environment {
          skybox: "storefront"
        }

        pipeline "InventorySync" {
          schedule: "*/5 * * * *"

          source POS {
            type: "rest"
            endpoint: "https://pos.example.com/products"
            method: "GET"
          }

          transform MapFields {
            sku -> productId
            qty -> stock
          }

          filter Changed {
            where: stock != previous.stock
          }

          sink Store {
            type: "rest"
            endpoint: "https://store.example.com/inventory"
            method: "PATCH"
          }
        }

        object "counter" {
          geometry: "cube"
          position: [0, 1, 0]
        }
      }
    `);

    expect(result.success).toBe(true);
    expect(result.ast).toBeDefined();

    // Find the pipeline domain block
    const pipelineBlock = result.ast!.domainBlocks?.find(
      (b) => b.domain === 'pipeline' && b.keyword === 'pipeline'
    );
    expect(pipelineBlock).toBeDefined();
    expect(pipelineBlock!.name).toBe('InventorySync');

    // Verify structured pipeline AST is attached
    const ast = pipelineBlock!.pipelineAST;
    expect(ast).toBeDefined();
    expect(ast!.name).toBe('InventorySync');
    expect(ast!.schedule).toBe('*/5 * * * *');
    expect(ast!.sources).toHaveLength(1);
    expect(ast!.sources[0].name).toBe('POS');
    expect(ast!.sources[0].type).toBe('rest');
    expect(ast!.transforms).toHaveLength(1);
    expect(ast!.transforms[0].mappings).toHaveLength(2);
    expect(ast!.filters).toHaveLength(1);
    expect(ast!.sinks).toHaveLength(1);
    expect(ast!.sinks[0].method).toBe('PATCH');

    // Verify the composition still has its other elements
    expect(result.ast!.environment).toBeDefined();
    expect(result.ast!.objects.length).toBeGreaterThanOrEqual(1);
  });

  it('parses pipeline with multiple sinks alongside scene objects', () => {
    const result = parseHolo(`
      composition "Dashboard" {
        pipeline "EventRouter" {
          source Events {
            type: "stream"
            endpoint: "https://events.example.com"
          }

          branch Route {
            when severity == "critical" -> sink Alert
            default -> sink Log
          }

          sink Alert {
            type: "webhook"
            endpoint: "https://alerts.example.com"
            method: "POST"
          }

          sink Log {
            type: "filesystem"
            path: "/var/log/events.jsonl"
            format: "jsonl"
          }
        }

        object "statusPanel" {
          geometry: "plane"
          position: [0, 2, -3]
        }
      }
    `);

    expect(result.success).toBe(true);
    const p = result.ast!.domainBlocks?.find((b) => b.keyword === 'pipeline');
    expect(p!.pipelineAST!.branches).toHaveLength(1);
    expect(p!.pipelineAST!.branches[0].routes).toHaveLength(2);
    expect(p!.pipelineAST!.sinks).toHaveLength(2);
  });

  it('backward-compat: flat properties still available', () => {
    const result = parseHolo(`
      composition "Test" {
        pipeline "Simple" {
          source In {
            type: "rest"
            endpoint: "https://api.test.com"
          }
          sink Out {
            type: "stdout"
          }
        }
      }
    `);

    expect(result.success).toBe(true);
    const p = result.ast!.domainBlocks?.find((b) => b.keyword === 'pipeline');
    // Flat properties for consumers that don't know about pipelineAST
    expect(p!.properties['sources']).toBe(1);
    expect(p!.properties['sinks']).toBe(1);
    expect(p!.properties['steps']).toBe(2);
  });
});
