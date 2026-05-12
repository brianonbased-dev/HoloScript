import { describe, it, expect, beforeEach } from 'vitest';
import {
  dropTableHandler,
  effectiveWeight,
  pickByWeight,
  type DropTableConfig,
  type DropTableEntry,
} from '../DropTableTrait';
import {
  createMockContext,
  createMockNode,
  attachTrait,
  sendEvent,
  getLastEvent,
  getEventCount,
} from './traitTestHelpers';

describe('DropTableTrait', () => {
  let node: Record<string, unknown>;
  let ctx: ReturnType<typeof createMockContext>;

  beforeEach(() => {
    node = createMockNode('drop-1');
    ctx = createMockContext();
  });

  // ---------------------------------------------------------------------------
  // onAttach
  // ---------------------------------------------------------------------------

  it('emits drop_table:ready on attach with total weight summary', () => {
    const cfg: Partial<DropTableConfig> = {
      tableId: 'basic-loot',
      entries: [
        { itemId: 'gold', weight: 10 },
        { itemId: 'gem', weight: 1 },
      ],
    };
    attachTrait(dropTableHandler, node, cfg, ctx);
    const ev = getLastEvent(ctx, 'drop_table:ready') as {
      tableId: string;
      entryCount: number;
      totalWeight: number;
    };
    expect(ev.tableId).toBe('basic-loot');
    expect(ev.entryCount).toBe(2);
    expect(ev.totalWeight).toBe(11);
  });

  // ---------------------------------------------------------------------------
  // drop_table:roll — FALSE + TRUE pairs per G.GOLD.013
  // ---------------------------------------------------------------------------

  it('FALSE: empty entries → zero drop_table:result events, one drop_table:empty', () => {
    const cfg: Partial<DropTableConfig> = { tableId: 'empty', entries: [] };
    attachTrait(dropTableHandler, node, cfg, ctx);
    sendEvent(dropTableHandler, node, cfg, ctx, { type: 'drop_table:roll', rollId: 'r1' });
    expect(getEventCount(ctx, 'drop_table:result')).toBe(0);
    expect(getEventCount(ctx, 'drop_table:empty')).toBe(1);
  });

  it('TRUE: single-entry table always returns that entry', () => {
    const cfg: Partial<DropTableConfig> = {
      tableId: 't',
      entries: [{ itemId: 'only-item', weight: 1 }],
    };
    attachTrait(dropTableHandler, node, cfg, ctx);
    sendEvent(dropTableHandler, node, cfg, ctx, { type: 'drop_table:roll' });
    const ev = getLastEvent(ctx, 'drop_table:result') as {
      itemId: string;
      totalWeight: number;
    };
    expect(ev.itemId).toBe('only-item');
    expect(ev.totalWeight).toBe(1);
  });

  // ---------------------------------------------------------------------------
  // weighted distribution — N=10000 statistical test per G.GOLD.013 TRUE case
  // ---------------------------------------------------------------------------

  it('TRUE: weighted distribution over 10,000 rolls matches expected within tolerance', () => {
    const cfg: Partial<DropTableConfig> = {
      tableId: 'weighted',
      entries: [
        { itemId: 'common', weight: 90 },
        { itemId: 'rare', weight: 10 },
      ],
    };
    attachTrait(dropTableHandler, node, cfg, ctx);
    const counts: Record<string, number> = { common: 0, rare: 0 };
    const N = 10_000;
    for (let i = 0; i < N; i++) {
      sendEvent(dropTableHandler, node, cfg, ctx, { type: 'drop_table:roll' });
    }
    for (const e of ctx.emittedEvents) {
      if (e.event === 'drop_table:result') {
        const r = e.data as { itemId: string };
        counts[r.itemId] = (counts[r.itemId] ?? 0) + 1;
      }
    }
    // Expected ratios: 0.9 / 0.1. Tolerance ±2% absolute on 10K samples is wide enough
    // to never flake under xorshift32 (variance is well-bounded for a stationary draw).
    const pCommon = counts.common / N;
    const pRare = counts.rare / N;
    expect(pCommon).toBeGreaterThan(0.88);
    expect(pCommon).toBeLessThan(0.92);
    expect(pRare).toBeGreaterThan(0.08);
    expect(pRare).toBeLessThan(0.12);
  });

  // ---------------------------------------------------------------------------
  // respectLuck + luckBonus composition with @luck
  // ---------------------------------------------------------------------------

  it('FALSE: respectLuck=false → luckBonus has no effect on draw distribution', () => {
    const entries: DropTableEntry[] = [
      { itemId: 'common', weight: 90 },
      { itemId: 'rare', weight: 10, rareModifier: 1 },
    ];
    const cfg: Partial<DropTableConfig> = { tableId: 'no-luck', entries, respectLuck: false };
    attachTrait(dropTableHandler, node, cfg, ctx);
    const N = 2000;
    for (let i = 0; i < N; i++) {
      sendEvent(dropTableHandler, node, cfg, ctx, { type: 'drop_table:roll', luckBonus: 5 });
    }
    let rare = 0;
    for (const e of ctx.emittedEvents) {
      if (e.event === 'drop_table:result') {
        if ((e.data as { itemId: string }).itemId === 'rare') rare++;
      }
    }
    // luckBonus=5 should have scaled rare entry hugely IF respectLuck were on.
    // With respectLuck=false the rare frequency stays around 10%.
    const pRare = rare / N;
    expect(pRare).toBeGreaterThan(0.06);
    expect(pRare).toBeLessThan(0.14);
  });

  it('TRUE: respectLuck=true + luckBonus shifts rare frequency upward', () => {
    const entries: DropTableEntry[] = [
      { itemId: 'common', weight: 90 },
      { itemId: 'rare', weight: 10, rareModifier: 1 },
    ];
    const cfg: Partial<DropTableConfig> = { tableId: 'with-luck', entries, respectLuck: true };
    attachTrait(dropTableHandler, node, cfg, ctx);
    const N = 2000;
    for (let i = 0; i < N; i++) {
      // luckBonus=5 → rare effective weight = 10 * (1 + 5*1) = 60. Common stays 90.
      // Expected rare frequency = 60 / 150 = 0.4.
      sendEvent(dropTableHandler, node, cfg, ctx, { type: 'drop_table:roll', luckBonus: 5 });
    }
    let rare = 0;
    for (const e of ctx.emittedEvents) {
      if (e.event === 'drop_table:result') {
        if ((e.data as { itemId: string }).itemId === 'rare') rare++;
      }
    }
    const pRare = rare / N;
    expect(pRare).toBeGreaterThan(0.35);
    expect(pRare).toBeLessThan(0.45);
  });

  // ---------------------------------------------------------------------------
  // G.GOLD.015 — experienced-failure category: all weights equal
  // ---------------------------------------------------------------------------

  it('G.GOLD.015 edge: all weights equal → roughly uniform distribution', () => {
    const cfg: Partial<DropTableConfig> = {
      tableId: 'uniform',
      entries: [
        { itemId: 'A', weight: 1 },
        { itemId: 'B', weight: 1 },
        { itemId: 'C', weight: 1 },
        { itemId: 'D', weight: 1 },
      ],
    };
    attachTrait(dropTableHandler, node, cfg, ctx);
    const counts: Record<string, number> = { A: 0, B: 0, C: 0, D: 0 };
    const N = 4000;
    for (let i = 0; i < N; i++) {
      sendEvent(dropTableHandler, node, cfg, ctx, { type: 'drop_table:roll' });
    }
    for (const e of ctx.emittedEvents) {
      if (e.event === 'drop_table:result') {
        const r = e.data as { itemId: string };
        counts[r.itemId] = (counts[r.itemId] ?? 0) + 1;
      }
    }
    for (const k of ['A', 'B', 'C', 'D']) {
      const p = counts[k] / N;
      expect(p).toBeGreaterThan(0.20);
      expect(p).toBeLessThan(0.30);
    }
  });

  // ---------------------------------------------------------------------------
  // seed override — derandomization debt knob
  // ---------------------------------------------------------------------------

  it('TRUE: explicit seed in roll payload makes two independent rolls identical', () => {
    const cfg: Partial<DropTableConfig> = {
      tableId: 'seed-test',
      entries: [
        { itemId: 'A', weight: 1 },
        { itemId: 'B', weight: 1 },
        { itemId: 'C', weight: 1 },
      ],
    };

    const nodeA = createMockNode('a');
    const ctxA = createMockContext();
    attachTrait(dropTableHandler, nodeA, cfg, ctxA);
    sendEvent(dropTableHandler, nodeA, cfg, ctxA, { type: 'drop_table:roll', seed: 777 });
    const resA = getLastEvent(ctxA, 'drop_table:result') as { itemId: string };

    const nodeB = createMockNode('b');
    const ctxB = createMockContext();
    attachTrait(dropTableHandler, nodeB, cfg, ctxB);
    sendEvent(dropTableHandler, nodeB, cfg, ctxB, { type: 'drop_table:roll', seed: 777 });
    const resB = getLastEvent(ctxB, 'drop_table:result') as { itemId: string };

    expect(resA.itemId).toBe(resB.itemId);
  });

  // ---------------------------------------------------------------------------
  // effectiveWeight — pure helper FALSE+TRUE
  // ---------------------------------------------------------------------------

  describe('effectiveWeight (pure)', () => {
    it('FALSE: zero / negative weight returns 0', () => {
      expect(effectiveWeight({ itemId: 'x', weight: 0 }, 5, true)).toBe(0);
      expect(effectiveWeight({ itemId: 'x', weight: -3 }, 5, true)).toBe(0);
    });

    it('FALSE: respectLuck=false returns raw weight regardless of rareModifier', () => {
      expect(
        effectiveWeight({ itemId: 'x', weight: 10, rareModifier: 99 }, 5, false)
      ).toBe(10);
    });

    it('TRUE: respectLuck=true scales by (1 + luckBonus * rareModifier)', () => {
      expect(effectiveWeight({ itemId: 'x', weight: 10, rareModifier: 1 }, 1, true)).toBe(20);
      expect(effectiveWeight({ itemId: 'x', weight: 10, rareModifier: 0.5 }, 4, true)).toBe(30);
    });

    it('TRUE: negative scaled result clamps to 0', () => {
      expect(effectiveWeight({ itemId: 'x', weight: 10, rareModifier: 1 }, -10, true)).toBe(0);
    });
  });

  // ---------------------------------------------------------------------------
  // pickByWeight — pure helper FALSE+TRUE
  // ---------------------------------------------------------------------------

  describe('pickByWeight (pure)', () => {
    it('FALSE: empty entries returns null', () => {
      expect(pickByWeight([], 0.5, 0, false)).toBeNull();
    });

    it('FALSE: all-zero weights returns null', () => {
      expect(
        pickByWeight(
          [
            { itemId: 'a', weight: 0 },
            { itemId: 'b', weight: 0 },
          ],
          0.5,
          0,
          false
        )
      ).toBeNull();
    });

    it('TRUE: draw at 0 returns first contributing entry', () => {
      const out = pickByWeight(
        [
          { itemId: 'a', weight: 1 },
          { itemId: 'b', weight: 1 },
        ],
        0,
        0,
        false
      );
      expect(out?.entry.itemId).toBe('a');
    });

    it('TRUE: draw near 1 returns the last contributing entry', () => {
      const out = pickByWeight(
        [
          { itemId: 'a', weight: 1 },
          { itemId: 'b', weight: 1 },
        ],
        0.999,
        0,
        false
      );
      expect(out?.entry.itemId).toBe('b');
    });
  });
});
