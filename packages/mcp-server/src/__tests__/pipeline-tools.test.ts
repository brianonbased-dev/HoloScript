import { describe, it, expect } from 'vitest';

describe('pipeline MCP tools', () => {
  const pipelineCode = `
    pipeline "InventorySync" {
      source POS {
        type: "rest"
        endpoint: "https://pos.example.com/items"
        method: "GET"
      }

      transform MapFields {
        sku -> productId
        qty -> stock
      }

      sink Out {
        type: "stdout"
      }
    }
  `;

  it.skip('parse_pipeline returns structured AST', async () => {
    const handlers = await import('../handlers');
    const result = (await handlers.handleTool('parse_pipeline', {
      code: pipelineCode,
    })) as {
      success: boolean;
      pipeline?: { name: string; sources: Array<{ name: string }>; sinks: Array<{ name: string }> };
    };

    expect(result.success).toBe(true);
    expect(result.pipeline?.name).toBe('InventorySync');
    expect(result.pipeline?.sources).toHaveLength(1);
    expect(result.pipeline?.sinks).toHaveLength(1);
  });

  it.skip('compile_pipeline emits node ESM code', async () => {
    const handlers = await import('../handlers');
    const result = (await handlers.handleTool('compile_pipeline', {
      code: pipelineCode,
      target: 'node',
      moduleName: 'index.mjs',
    })) as { success: boolean; code?: string };

    expect(result.success).toBe(true);
    expect(result.code).toContain('export async function runPipeline()');
    expect(result.code).toContain('InventorySync');
  });
});
