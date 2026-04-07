import { describe, it, expect } from 'vitest';
import { compilePipelineSourceToNode } from '../PipelineNodeCompiler';

const SOURCE = `
  pipeline "InventorySync" {
    source POS {
      type: "list"
    }

    transform MapFields {
      sku -> productId
      qty -> stock : multiply(100)
    }

    filter Active {
      where: stock > 0
    }

    validate Product {
      productId: required, string
      stock: required
    }

    sink Out {
      type: "stdout"
    }
  }
`;

describe('PipelineNodeCompiler', () => {
  it('compiles pipeline source into runnable node module code', () => {
    const result = compilePipelineSourceToNode(SOURCE, { moduleName: 'index.mjs' });
    expect(result.success).toBe(true);
    expect(result.code).toContain('export async function runPipeline()');
    expect(result.code).toContain('applyTransforms');
    expect(result.code).toContain('Pipeline completed');
  });

  it('returns parser errors for invalid pipeline source', () => {
    const result = compilePipelineSourceToNode('object "Cube" { }');
    expect(result.success).toBe(false);
    expect(result.errors?.length).toBeGreaterThan(0);
  });
});
