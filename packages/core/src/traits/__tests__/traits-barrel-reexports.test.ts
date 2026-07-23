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
import {
  volumetricCloudsHandler,
  fluidSimulationHandler,
  cacheHandler,
  retryHandler,
} from '../index';

describe('traits barrel re-exports', () => {
  it('re-exports the marketplace-cataloged handlers restored on 2026-07-09', () => {
    expect(volumetricCloudsHandler).toBeDefined();
    expect(volumetricCloudsHandler.name).toBe('volumetric_clouds');

    expect(fluidSimulationHandler).toBeDefined();
    expect(fluidSimulationHandler.name).toBe('fluid_simulation');

    expect(cacheHandler).toBeDefined();
    expect(cacheHandler.name).toBe('cache');

    expect(retryHandler).toBeDefined();
    expect(retryHandler.name).toBe('retry');
  });
});
