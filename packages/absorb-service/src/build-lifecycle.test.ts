import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import buildConfig from '../tsup.config';

describe('HoloAbsorb build lifecycle', () => {
  it('emits self-contained entries for long-lived MCP hosts', () => {
    const configs = Array.isArray(buildConfig) ? buildConfig : [buildConfig];

    expect(configs.length).toBeGreaterThan(0);
    for (const config of configs) {
      expect(config.splitting).toBe(false);
      expect(config.clean).toBe(true);
    }
  });

  it('resolves embedding workers from self-contained MCP bundle layouts', () => {
    const source = readFileSync(new URL('./engine/EmbeddingIndex.ts', import.meta.url), 'utf8');

    expect(source).toContain("path.join(__dirname_esm, '..', 'workers')");
    expect(source).toContain('resolveEmbeddingWorkerFile()');
    expect(source).toContain('if (!workerFile)');
  });
});
