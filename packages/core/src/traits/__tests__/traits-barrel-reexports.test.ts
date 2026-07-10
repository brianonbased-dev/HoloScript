/**
 * Traits barrel re-export coverage.
 *
 * Guards against the barrel gap where a trait is implemented in
 * src/traits/<Name>Trait.ts but never re-exported from './index', silently
 * breaking `import { xHandler } from '@holoscript/core/traits'` claims —
 * e.g. the marketplace curated catalog's `export` field
 * (packages/marketplace-api/src/seed/curated-traits.json).
 *
 * The four handlers below were exactly that gap (caught in the 2026-07-09
 * catalog freshness pass) and were restored to the barrel; keep them here so
 * the gap cannot reopen unnoticed.
 */

import { describe, it, expect } from 'vitest';

describe('traits barrel re-exports', () => {
  it('re-exports the marketplace-cataloged handlers restored on 2026-07-09', async () => {
    const barrel = await import('../index');

    expect(barrel.volumetricCloudsHandler).toBeDefined();
    expect(barrel.volumetricCloudsHandler.name).toBe('volumetric_clouds');

    expect(barrel.fluidSimulationHandler).toBeDefined();
    expect(barrel.fluidSimulationHandler.name).toBe('fluid_simulation');

    expect(barrel.cacheHandler).toBeDefined();
    expect(barrel.cacheHandler.name).toBe('cache');

    expect(barrel.retryHandler).toBeDefined();
    expect(barrel.retryHandler.name).toBe('retry');
  });
});
