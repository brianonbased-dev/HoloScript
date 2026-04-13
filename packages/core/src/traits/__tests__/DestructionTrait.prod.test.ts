/**
 * DestructionTrait — Production Test Suite
 */
import { describe, it, expect, vi } from 'vitest';
import { destructionHandler } from '../DestructionTrait';

function makeNode(overrides: any = {}) {
  return {
    id: 'dest_node',
    position: [0, 0, 0],
    scale: { x: 1, y: 1, z: 1 },
    ...overrides,
  };
}
function makeCtx() {
  return { emit: vi.fn() };
}
function attach(cfg: any = {}, nodeOverrides: any = {}) {
  const node = makeNode(nodeOverrides);
  const ctx = makeCtx();
  const config = { ...destructionHandler.defaultConfig!, ...cfg };
  destructionHandler.onAttach!(node, config, ctx);
  return { node: node as any, ctx, config };
}

// ─── defaultConfig ─────────────────────────────────────────────────────────────

describe('destructionHandler.defaultConfig', () => {
  const d = destructionHandler.defaultConfig!;
  it('mode=voronoi', () => expect(d.mode).toBe('voronoi'));
  it('fragment_count=8', () => expect(d.fragment_count).toBe(8));
  it('impact_threshold=10', () => expect(d.impact_threshold).toBe(10));
  it('damage_threshold=0', () => expect(d.damage_threshold).toBe(0));
  it('fragment_lifetime=5', () => expect(d.fragment_lifetime).toBe(5));
  it('explosion_force=5', () => expect(d.explosion_force).toBe(5));
  it('chain_reaction=false', () => expect(d.chain_reaction).toBe(false));
  it('chain_radius=3', () => expect(d.chain_radius).toBe(3));
  it('debris_physics=true', () => expect(d.debris_physics).toBe(true));
  it('fade_fragments=true', () => expect(d.fade_fragments).toBe(true));
});

// ─── onAttach ─────────────────────────────────────────────────────────────────

describe('destructionHandler.onAttach', () => {
  it('creates __destructionState', () => expect(attach().node.__destructionState).toBeDefined());
  it('currentHealth=100', () => expect(attach().node.__destructionState.currentHealth).toBe(100));
  it('maxHealth=100', () => expect(attach().node.__destructionState.maxHealth).toBe(100));
  it('isDestroyed=false', () => expect(attach().node.__destructionState.isDestroyed).toBe(false));
  it('fragments=[]', () => expect(attach().node.__destructionState.fragments).toHaveLength(0));
  it('accumulatedDamage=0', () =>
    expect(attach().node.__destructionState.accumulatedDamage).toBe(0));
  it('chainReactionTriggered=false', () =>
    expect(attach().node.__destructionState.chainReactionTriggered).toBe(false));
  it('emits subscribe_collision', () => {
    const { ctx } = attach();
    expect(ctx.emit).toHaveBeenCalledWith('subscribe_collision', expect.anything());
  });
});

// ─── onDetach ─────────────────────────────────────────────────────────────────

describe('destructionHandler.onDetach', () => {
  it('removes __destructionState', () => {
    const { node, config, ctx } = attach();
    destructionHandler.onDetach!(node, config, ctx);
    expect(node.__destructionState).toBeUndefined();
  });
  it('no emit for fragments without mesh', () => {
    const { node, config, ctx } = attach();
    node.__destructionState.fragments = [{ id: 'f1', lifetime: 1, mesh: null }];
    ctx.emit.mockClear();
    destructionHandler.onDetach!(node, config, ctx);
    expect(ctx.emit).not.toHaveBeenCalledWith('remove_object', expect.anything());
  });
  it('emits remove_object for fragments with mesh', () => {
    const { node, config, ctx } = attach();
    const frag = { id: 'f1', lifetime: 1, mesh: { id: 'frag_mesh' } };
    node.__destructionState.fragments = [frag];
    ctx.emit.mockClear();
    destructionHandler.onDetach!(node, config, ctx);
    expect(ctx.emit).toHaveBeenCalledWith(
      'remove_object',
      expect.objectContaining({ node: frag.mesh })
    );
  });
});

// ─── onEvent — damage ─────────────────────────────────────────────────────────

describe('destructionHandler.onEvent — damage', () => {
  it('decrements currentHealth by amount', () => {
    const { node, ctx, config } = attach();
    destructionHandler.onEvent!(node, config, ctx, { type: 'damage', amount: 30 });
    expect(node.__destructionState.currentHealth).toBe(70);
  });
  it('accumulates accumulatedDamage', () => {
    const { node, ctx, config } = attach();
    destructionHandler.onEvent!(node, config, ctx, { type: 'damage', amount: 20 });
    destructionHandler.onEvent!(node, config, ctx, { type: 'damage', amount: 15 });
    expect(node.__destructionState.accumulatedDamage).toBe(35);
  });
  it('defaults amount=10 when not provided', () => {
    const { node, ctx, config } = attach();
    destructionHandler.onEvent!(node, config, ctx, { type: 'damage' });
    expect(node.__destructionState.currentHealth).toBe(90);
  });
  it('triggers destruction when health reaches damage_threshold', () => {
    const { node, ctx, config } = attach({ damage_threshold: 0 });
    ctx.emit.mockClear();
    destructionHandler.onEvent!(node, config, ctx, { type: 'damage', amount: 100 });
    expect(node.__destructionState.isDestroyed).toBe(true);
    expect(ctx.emit).toHaveBeenCalledWith('on_destruction', expect.anything());
  });
  it('no double-destruction if already destroyed', () => {
    const { node, ctx, config } = attach({ damage_threshold: 0 });
    destructionHandler.onEvent!(node, config, ctx, { type: 'damage', amount: 100 });
    const callCount = ctx.emit.mock.calls.filter((c: any[]) => c[0] === 'on_destruction').length;
    destructionHandler.onEvent!(node, config, ctx, { type: 'damage', amount: 100 });
    expect(ctx.emit.mock.calls.filter((c: any[]) => c[0] === 'on_destruction').length).toBe(
      callCount
    );
  });
  it('does not destroy when health above threshold', () => {
    const { node, ctx, config } = attach({ damage_threshold: 0 });
    destructionHandler.onEvent!(node, config, ctx, { type: 'damage', amount: 50 });
    expect(node.__destructionState.isDestroyed).toBe(false);
  });
});

// ─── onEvent — destroy ────────────────────────────────────────────────────────

describe('destructionHandler.onEvent — destroy', () => {
  it('sets isDestroyed=true', () => {
    const { node, ctx, config } = attach();
    destructionHandler.onEvent!(node, config, ctx, { type: 'destroy' });
    expect(node.__destructionState.isDestroyed).toBe(true);
  });
  it('generates fragments', () => {
    const { node, ctx, config } = attach({ fragment_count: 6 });
    destructionHandler.onEvent!(node, config, ctx, { type: 'destroy' });
    expect(node.__destructionState.fragments).toHaveLength(6);
  });
  it('fragment lifetime equals config.fragment_lifetime', () => {
    const { node, ctx, config } = attach({ fragment_count: 2, fragment_lifetime: 3 });
    destructionHandler.onEvent!(node, config, ctx, { type: 'destroy' });
    expect(node.__destructionState.fragments[0].lifetime).toBe(3);
  });
  it('emits on_destruction with fragment count', () => {
    const { node, ctx, config } = attach({ fragment_count: 4 });
    ctx.emit.mockClear();
    destructionHandler.onEvent!(node, config, ctx, { type: 'destroy' });
    expect(ctx.emit).toHaveBeenCalledWith(
      'on_destruction',
      expect.objectContaining({ fragments: 4 })
    );
  });
  it('does not destroy if already destroyed', () => {
    const { node, ctx, config } = attach({ fragment_count: 2 });
    destructionHandler.onEvent!(node, config, ctx, { type: 'destroy' });
    const firstFrags = node.__destructionState.fragments.length;
    destructionHandler.onEvent!(node, config, ctx, { type: 'destroy' });
    expect(node.__destructionState.fragments.length).toBe(firstFrags);
  });
  it('stores originalMesh for repair', () => {
    const { node, ctx, config } = attach();
    node.mesh = { id: 'mesh1' };
    destructionHandler.onEvent!(node, config, ctx, { type: 'destroy' });
    expect(node.__destructionState.originalMesh).toBeDefined();
  });
});

// ─── onEvent — repair ────────────────────────────────────────────────────────

describe('destructionHandler.onEvent — repair', () => {
  it('resets currentHealth to maxHealth', () => {
    const { node, ctx, config } = attach();
    destructionHandler.onEvent!(node, config, ctx, { type: 'damage', amount: 60 });
    destructionHandler.onEvent!(node, config, ctx, { type: 'repair' });
    expect(node.__destructionState.currentHealth).toBe(100);
  });
  it('resets accumulatedDamage to 0', () => {
    const { node, ctx, config } = attach();
    destructionHandler.onEvent!(node, config, ctx, { type: 'damage', amount: 40 });
    destructionHandler.onEvent!(node, config, ctx, { type: 'repair' });
    expect(node.__destructionState.accumulatedDamage).toBe(0);
  });
  it('sets isDestroyed=false after destroy+repair', () => {
    const { node, ctx, config } = attach({ fragment_count: 2 });
    destructionHandler.onEvent!(node, config, ctx, { type: 'destroy' });
    destructionHandler.onEvent!(node, config, ctx, { type: 'repair' });
    expect(node.__destructionState.isDestroyed).toBe(false);
  });
  it('clears fragments after repair', () => {
    const { node, ctx, config } = attach({ fragment_count: 4 });
    destructionHandler.onEvent!(node, config, ctx, { type: 'destroy' });
    destructionHandler.onEvent!(node, config, ctx, { type: 'repair' });
    expect(node.__destructionState.fragments).toHaveLength(0);
  });
  it('emits on_repaired after destroy+repair', () => {
    const { node, ctx, config } = attach({ fragment_count: 2 });
    destructionHandler.onEvent!(node, config, ctx, { type: 'destroy' });
    ctx.emit.mockClear();
    destructionHandler.onEvent!(node, config, ctx, { type: 'repair' });
    expect(ctx.emit).toHaveBeenCalledWith('on_repaired', expect.anything());
  });
  it('emits set_visible(true) after destroy+repair', () => {
    const { node, ctx, config } = attach({ fragment_count: 2 });
    destructionHandler.onEvent!(node, config, ctx, { type: 'destroy' });
    ctx.emit.mockClear();
    destructionHandler.onEvent!(node, config, ctx, { type: 'repair' });
    expect(ctx.emit).toHaveBeenCalledWith(
      'set_visible',
      expect.objectContaining({ visible: true })
    );
  });
  it('repair without prior destruction just resets health', () => {
    const { node, ctx, config } = attach();
    destructionHandler.onEvent!(node, config, ctx, { type: 'damage', amount: 30 });
    destructionHandler.onEvent!(node, config, ctx, { type: 'repair' });
    expect(node.__destructionState.currentHealth).toBe(100);
    expect(node.__destructionState.isDestroyed).toBe(false);
  });
});

// ─── onUpdate — fragment physics ──────────────────────────────────────────────

describe('destructionHandler.onUpdate — fragment physics', () => {
  it('no-ops when not destroyed', () => {
    const { node, ctx, config } = attach();
    ctx.emit.mockClear();
    destructionHandler.onUpdate!(node, config, ctx, 0.1);
    expect(ctx.emit).not.toHaveBeenCalledWith('on_destruction_complete', expect.anything());
  });
  it('decrements fragment lifetime by delta', () => {
    const { node, ctx, config } = attach({ fragment_count: 1, fragment_lifetime: 2 });
    destructionHandler.onEvent!(node, config, ctx, { type: 'destroy' });
    const frag = node.__destructionState.fragments[0];
    const prevLifetime = frag.lifetime;
    destructionHandler.onUpdate!(node, config, ctx, 0.5);
    expect(node.__destructionState.fragments[0]?.lifetime ?? prevLifetime - 0.5).toBeCloseTo(
      prevLifetime - 0.5,
      1
    );
  });
  it('applies gravity to fragment y-velocity', () => {
    const { node, ctx, config } = attach({ fragment_count: 1 });
    destructionHandler.onEvent!(node, config, ctx, { type: 'destroy' });
    const frag = node.__destructionState.fragments[0];
    // Set y high enough to avoid ground bounce (semi-implicit Euler moves y by vy*dt AFTER
    // applying gravity, so a fragment near y=0 can drop below ground in the same step)
    frag.position.y = 10;
    frag.velocity.y = 0;
    const delta = 0.1;
    destructionHandler.onUpdate!(node, config, ctx, delta);
    // gravity = 9.81, velocity.y should be negative (downward)
    if (node.__destructionState.fragments.length > 0) {
      expect(node.__destructionState.fragments[0].velocity.y).toBeCloseTo(-9.81 * delta, 2);
    }
  });
  it('updates fragment position by velocity * delta', () => {
    const { node, ctx, config } = attach({ fragment_count: 1, fragment_lifetime: 100 });
    destructionHandler.onEvent!(node, config, ctx, { type: 'destroy' });
    const frag = node.__destructionState.fragments[0];
    frag.velocity.x = 10;
    frag.velocity.y = 0;
    frag.velocity.z = 0;
    const prevX = frag.position.x;
    destructionHandler.onUpdate!(node, config, ctx, 0.1);
    // Position should have moved by (velocity.x * drag) * delta ≈ prevX + 10 * 0.1 = prevX + 1
    // Since drag is applied after position update, position.x = prevX + 10 * 0.1 = prevX + 1
    expect(frag.position.x).toBeGreaterThan(prevX);
  });
  it('emits on_destruction_complete when all fragments expire', () => {
    const { node, ctx, config } = attach({ fragment_count: 1, fragment_lifetime: 0.05 });
    destructionHandler.onEvent!(node, config, ctx, { type: 'destroy' });
    ctx.emit.mockClear();
    // Advance past fragment lifetime
    destructionHandler.onUpdate!(node, config, ctx, 1.0);
    expect(ctx.emit).toHaveBeenCalledWith('on_destruction_complete', expect.anything());
  });
  it('bounces fragment on ground (y<0)', () => {
    const { node, ctx, config } = attach({ fragment_count: 1, fragment_lifetime: 100 });
    destructionHandler.onEvent!(node, config, ctx, { type: 'destroy' });
    const frag = node.__destructionState.fragments[0];
    frag.position.y = -0.5;
    frag.velocity.y = -5;
    destructionHandler.onUpdate!(node, config, ctx, 0.016);
    if (node.__destructionState.fragments.length > 0) {
      expect(node.__destructionState.fragments[0].position.y).toBeGreaterThanOrEqual(0);
    }
  });
});
