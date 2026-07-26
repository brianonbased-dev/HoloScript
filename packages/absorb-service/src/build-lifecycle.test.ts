import { describe, expect, it } from 'vitest';
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
});
