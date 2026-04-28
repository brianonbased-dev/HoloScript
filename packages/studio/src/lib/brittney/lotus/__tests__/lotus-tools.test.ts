/**
 * Tests for executeLotusTool — the Brittney garden-tending executor.
 *
 * Three classes of invariants pinned here:
 *
 *   READ-ONLY (always succeed):
 *     - read_garden_state returns all 16 petals + readiness verdict
 *     - tend_garden returns markdown summary + readiness verdict
 *     - propose_evidence returns blockedBy keys + human-readable proposals
 *
 *   GATED MUTATIONS (must agree with derivePetalBloomState):
 *     - bloom_petal succeeds when target_state === derived state
 *     - bloom_petal returns gateRejected: true when target_state !== derived
 *     - wilt_petal succeeds only when derived state IS already wilted
 *     - wilt_petal returns gateRejected: true on a healthy petal
 *
 *   ERROR HANDLING:
 *     - Unknown paper_id returns success: false with helpful message
 *     - Unknown tool returns success: false
 *     - Invalid target_state returns success: false (validation, not gating)
 *
 * The fixture-backed evidence at __fixtures__/petal-evidence-snapshot.json
 * provides realistic 2026-04-27 state — most papers in budding/blooming,
 * none full, none wilted. Tests here use that fixture as ground truth.
 */

import { describe, it, expect } from 'vitest';
import { executeLotusTool, isLotusTool, LOTUS_TOOL_NAMES } from '../LotusTools';

describe('isLotusTool / LOTUS_TOOL_NAMES', () => {
  it('recognizes all 5 lotus tool names', () => {
    expect(isLotusTool('read_garden_state')).toBe(true);
    expect(isLotusTool('tend_garden')).toBe(true);
    expect(isLotusTool('propose_evidence')).toBe(true);
    expect(isLotusTool('bloom_petal')).toBe(true);
    expect(isLotusTool('wilt_petal')).toBe(true);
    expect(LOTUS_TOOL_NAMES.size).toBe(5);
  });

  it('rejects non-lotus tools', () => {
    expect(isLotusTool('add_trait')).toBe(false);
    expect(isLotusTool('create_object')).toBe(false);
    expect(isLotusTool('studio_save_project')).toBe(false);
    expect(isLotusTool('')).toBe(false);
  });
});

describe('read_garden_state', () => {
  it('returns all 16 petals with derived state + readiness verdict', () => {
    const result = executeLotusTool('read_garden_state', {});
    expect(result.success).toBe(true);
    const data = result.data as {
      petals: Record<string, { state: string; reason: string }>;
      readiness: { ready: boolean; fullPetals: number; totalPetals: number };
      snapshot: { snapshot_at: string };
    };
    expect(Object.keys(data.petals)).toHaveLength(16);
    expect(data.readiness.totalPetals).toBe(16);
    // Per the 2026-04-27 fixture: zero full petals (TVCG is held; everyone
    // else has stubs or anchor gaps). Lotus Genesis NOT ready.
    expect(data.readiness.fullPetals).toBe(0);
    expect(data.readiness.ready).toBe(false);
    expect(data.snapshot.snapshot_at).toBe('2026-04-27');
  });

  it('every petal has a non-empty reason string', () => {
    const result = executeLotusTool('read_garden_state', {});
    const data = result.data as { petals: Record<string, { state: string; reason: string }> };
    for (const [paperId, info] of Object.entries(data.petals)) {
      expect(info.reason.length).toBeGreaterThan(0);
      expect(['sealed', 'budding', 'blooming', 'full', 'wilted']).toContain(info.state);
      expect(paperId).toBeTruthy();
    }
  });
});

describe('tend_garden', () => {
  it('returns markdown summary with readiness verdict', () => {
    const result = executeLotusTool('tend_garden', {});
    expect(result.success).toBe(true);
    const data = result.data as { summary_markdown: string; readiness: { ready: boolean } };
    expect(data.summary_markdown).toContain('# Lotus Garden — Tending Report');
    expect(data.summary_markdown).toContain('## Lotus Genesis Readiness');
    expect(data.summary_markdown).toContain('Ready: **NO**');
    expect(data.readiness.ready).toBe(false);
  });

  it('groups petals by state in the markdown', () => {
    const result = executeLotusTool('tend_garden', {});
    const data = result.data as { summary_markdown: string };
    // Per fixture: should have at least one petal in budding (e.g., cael
    // with stubCount > 0) and at least one in blooming (e.g., trust-by-
    // construction with no stubs but no anchors per HELD status).
    expect(data.summary_markdown).toMatch(/## (sealed|budding|blooming|full|wilted)/);
  });
});

describe('propose_evidence', () => {
  it('returns proposals for a budding petal (cael — has stubs)', () => {
    const result = executeLotusTool('propose_evidence', { paper_id: 'cael' });
    expect(result.success).toBe(true);
    expect(result.paperId).toBe('cael');
    const data = result.data as {
      currentState: string;
      blockedBy: string[];
      proposals: string[];
    };
    expect(data.currentState).toBe('budding');
    expect(data.blockedBy).toContain('stubCount');
    expect(data.proposals.some((p) => p.includes('\\stub{}'))).toBe(true);
  });

  it('returns proposals for a sealed petal (no draft)', () => {
    const result = executeLotusTool('propose_evidence', { paper_id: 'p3-s1-hs-core-ir' });
    expect(result.success).toBe(true);
    const data = result.data as { currentState: string; proposals: string[] };
    expect(data.currentState).toBe('sealed');
    expect(data.proposals.some((p) => p.toLowerCase().includes('draft'))).toBe(true);
  });

  it('rejects unknown paper_id with helpful list', () => {
    const result = executeLotusTool('propose_evidence', { paper_id: 'nonexistent-paper' });
    expect(result.success).toBe(false);
    expect(result.error).toContain('Unknown paper_id');
    expect(result.error).toContain('nonexistent-paper');
  });

  it('rejects empty paper_id', () => {
    const result = executeLotusTool('propose_evidence', {});
    expect(result.success).toBe(false);
    expect(result.error).toBe('paper_id is required');
  });
});

describe('bloom_petal — architectural-trust gating', () => {
  it('SUCCEEDS when target_state agrees with derived state (cael is budding)', () => {
    const result = executeLotusTool('bloom_petal', {
      paper_id: 'cael',
      target_state: 'budding',
    });
    expect(result.success).toBe(true);
    expect(result.gateRejected).toBeFalsy();
    expect(result.newState).toBe('budding');
    expect(result.paperId).toBe('cael');
  });

  it('REJECTS when target_state disagrees with derived (cael is budding, not full)', () => {
    // The architectural-trust thesis in action: Brittney cannot lie.
    const result = executeLotusTool('bloom_petal', {
      paper_id: 'cael',
      target_state: 'full',
    });
    expect(result.success).toBe(false);
    expect(result.gateRejected).toBe(true);
    expect(result.error).toContain('Cannot bloom petal "cael" to "full"');
    expect(result.error).toContain('budding');
    expect(result.error).toContain('propose_evidence');
  });

  it('REJECTS attempt to bloom a sealed petal to blooming', () => {
    const result = executeLotusTool('bloom_petal', {
      paper_id: 'p3-s1-hs-core-ir',
      target_state: 'blooming',
    });
    expect(result.success).toBe(false);
    expect(result.gateRejected).toBe(true);
    expect(result.error).toContain('"sealed"');
  });

  it('rejects invalid target_state with validation error (NOT gateRejected)', () => {
    const result = executeLotusTool('bloom_petal', {
      paper_id: 'cael',
      target_state: 'overflowing',
    });
    expect(result.success).toBe(false);
    expect(result.gateRejected).toBeFalsy();
    expect(result.error).toContain('Invalid target_state');
  });

  it('rejects unknown paper_id', () => {
    const result = executeLotusTool('bloom_petal', {
      paper_id: 'fake-paper',
      target_state: 'budding',
    });
    expect(result.success).toBe(false);
    expect(result.error).toContain('Unknown paper_id');
  });
});

describe('wilt_petal — architectural-trust gating', () => {
  it('REJECTS wilting a healthy petal (no paper in fixture is wilted)', () => {
    // The fixture has no wilted papers, so every wilt attempt should be
    // gate-rejected. This pins the asymmetry: wilting requires evidence
    // of retraction or provenance break, just like blooming requires
    // evidence of the target bloom state.
    const result = executeLotusTool('wilt_petal', {
      paper_id: 'cael',
      reason: 'just because',
    });
    expect(result.success).toBe(false);
    expect(result.gateRejected).toBe(true);
    expect(result.error).toContain('Cannot wilt petal "cael"');
    expect(result.error).toContain('budding');
    expect(result.error).toContain('retraction');
  });

  it('rejects empty reason', () => {
    const result = executeLotusTool('wilt_petal', { paper_id: 'cael' });
    expect(result.success).toBe(false);
    expect(result.error).toBe('reason is required for wilt');
  });
});

describe('unknown tool', () => {
  it('returns success: false with informative error', () => {
    const result = executeLotusTool('plant_seed', {});
    expect(result.success).toBe(false);
    expect(result.error).toContain('Unknown lotus tool: plant_seed');
  });
});
