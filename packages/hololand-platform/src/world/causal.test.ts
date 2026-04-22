import { describe, it, expect, beforeEach } from 'vitest';
import {
  CausalWorldModel,
  createVRPhysicsModel,
  type CausalVariable,
  type CausalEdge,
} from '../world/causal';

describe('CausalWorldModel', () => {
  let model: CausalWorldModel;

  beforeEach(() => {
    model = new CausalWorldModel();
    model.addVariable({ id: 'gravity',     name: 'Gravity',     value: 9.8  });
    model.addVariable({ id: 'jumpHeight',  name: 'Jump Height', value: 1.2  });
    model.addEdge({ from: 'gravity', to: 'jumpHeight', coefficient: -0.1 });
  });

  // -------------------------------------------------------------------------
  // Graph construction
  // -------------------------------------------------------------------------

  it('stores added variables', () => {
    const vars = model.getVariables();
    expect(vars).toHaveLength(2);
    expect(vars.map(v => v.id)).toContain('gravity');
    expect(vars.map(v => v.id)).toContain('jumpHeight');
  });

  it('stores added edges', () => {
    const edges = model.getEdges();
    expect(edges).toHaveLength(1);
    expect(edges[0]).toMatchObject({ from: 'gravity', to: 'jumpHeight', coefficient: -0.1 });
  });

  it('throws when adding edge with unknown source', () => {
    expect(() =>
      model.addEdge({ from: 'unknown', to: 'jumpHeight', coefficient: 1 })
    ).toThrow(/Unknown source variable/);
  });

  it('throws when adding edge with unknown target', () => {
    expect(() =>
      model.addEdge({ from: 'gravity', to: 'unknown', coefficient: 1 })
    ).toThrow(/Unknown target variable/);
  });

  it('throws when adding an edge that would create a cycle', () => {
    expect(() =>
      model.addEdge({ from: 'jumpHeight', to: 'gravity', coefficient: 1 })
    ).toThrow(/cycle/);
  });

  it('removes a variable and its incident edges', () => {
    model.removeVariable('gravity');
    expect(model.getVariables()).toHaveLength(1);
    expect(model.getEdges()).toHaveLength(0);
  });

  // -------------------------------------------------------------------------
  // Intervention (do-calculus)
  // -------------------------------------------------------------------------

  it('intervention: baseline (no change) returns original values', () => {
    const result = model.intervention('gravity', 9.8);
    expect(result.values.gravity).toBeCloseTo(9.8);
    expect(result.values.jumpHeight).toBeCloseTo(1.2);
  });

  it('intervention: doubling gravity reduces jump height', () => {
    const result = model.intervention('gravity', 19.6);
    // delta gravity = +9.8; jumpHeight += -0.1 * 9.8 = -0.98 → 1.2 - 0.98 = 0.22
    expect(result.values.jumpHeight).toBeCloseTo(0.22, 5);
  });

  it('intervention: halving gravity increases jump height', () => {
    const result = model.intervention('gravity', 4.9);
    // delta gravity = -4.9; jumpHeight += -0.1 * -4.9 = +0.49 → 1.69
    expect(result.values.jumpHeight).toBeCloseTo(1.69, 5);
  });

  it('intervention on leaf variable does not change parent', () => {
    const result = model.intervention('jumpHeight', 3.0);
    expect(result.values.gravity).toBeCloseTo(9.8);
    expect(result.values.jumpHeight).toBeCloseTo(3.0);
  });

  it('intervention: throws for unknown variable', () => {
    expect(() => model.intervention('nonexistent', 5)).toThrow(/Unknown variable/);
  });

  it('intervention returns evaluation order', () => {
    const result = model.intervention('gravity', 10);
    expect(result.evaluationOrder).toContain('gravity');
    expect(result.evaluationOrder).toContain('jumpHeight');
    // gravity must appear before jumpHeight in topological order
    const gi = result.evaluationOrder.indexOf('gravity');
    const ji = result.evaluationOrder.indexOf('jumpHeight');
    expect(gi).toBeLessThan(ji);
  });

  // -------------------------------------------------------------------------
  // Counterfactual
  // -------------------------------------------------------------------------

  it('counterfactual: matches intervention when observed equals model defaults', () => {
    const intResult = model.intervention('gravity', 19.6);
    const cfResult  = model.counterfactual('gravity', 19.6);
    expect(cfResult.values.jumpHeight).toBeCloseTo(intResult.values.jumpHeight, 4);
  });

  it('counterfactual: abducts noise from observed and applies it', () => {
    // Observed: jumpHeight = 2.0 (higher than model default 1.2)
    // Noise U_jumpHeight = 2.0 - 1.2 = 0.8
    // CF: gravity = 19.6 → delta gravity = 9.8 → base effect = -0.98
    // CF jumpHeight = 1.2 + 0.8 + (-0.1 * 9.8) = 2.0 - 0.98 = 1.02
    const cfResult = model.counterfactual('gravity', 19.6, {
      gravity: 9.8,
      jumpHeight: 2.0,
    });
    expect(cfResult.values.jumpHeight).toBeCloseTo(1.02, 4);
  });

  it('counterfactual: throws for unknown variable', () => {
    expect(() => model.counterfactual('nonexistent', 5)).toThrow(/Unknown variable/);
  });

  // -------------------------------------------------------------------------
  // Batch simulation
  // -------------------------------------------------------------------------

  it('simulateScenarios returns one result per scenario', () => {
    const scenarios = [
      { label: 'double gravity',  variableId: 'gravity', value: 19.6 },
      { label: 'half gravity',    variableId: 'gravity', value: 4.9  },
      { label: 'zero gravity',    variableId: 'gravity', value: 0    },
    ];
    const results = model.simulateScenarios(scenarios);
    expect(results).toHaveLength(3);
    results.forEach((r, i) => expect(r.label).toBe(scenarios[i].label));
  });

  it('simulateScenarios: zero gravity gives maximum jump', () => {
    const results = model.simulateScenarios([
      { label: 'zero',   variableId: 'gravity', value: 0 },
      { label: 'normal', variableId: 'gravity', value: 9.8 },
    ]);
    const zero   = results.find(r => r.label === 'zero')!;
    const normal = results.find(r => r.label === 'normal')!;
    expect(zero.result.values.jumpHeight).toBeGreaterThan(normal.result.values.jumpHeight);
  });

  // -------------------------------------------------------------------------
  // Multi-step causal chains
  // -------------------------------------------------------------------------

  it('propagates through a two-hop chain', () => {
    // gravity → jumpHeight → reachable (new leaf)
    model.addVariable({ id: 'reachable', name: 'Reachable Height', value: 2.5 });
    model.addEdge({ from: 'jumpHeight', to: 'reachable', coefficient: 2.0 });

    const result = model.intervention('gravity', 14.8);
    // delta gravity = 5; jumpHeight += -0.1 * 5 = -0.5 → 0.7
    // delta jumpHeight = -0.5; reachable += 2.0 * -0.5 = -1.0 → 1.5
    expect(result.values.jumpHeight).toBeCloseTo(0.7, 4);
    expect(result.values.reachable).toBeCloseTo(1.5, 4);
  });

  // -------------------------------------------------------------------------
  // Serialisation
  // -------------------------------------------------------------------------

  it('serialises and deserialises correctly', () => {
    const json = model.toJSON();
    const restored = CausalWorldModel.fromJSON(json);
    const result = restored.intervention('gravity', 19.6);
    expect(result.values.jumpHeight).toBeCloseTo(0.22, 5);
  });

  // -------------------------------------------------------------------------
  // VR Physics preset factory
  // -------------------------------------------------------------------------

  describe('createVRPhysicsModel', () => {
    let vrModel: CausalWorldModel;

    beforeEach(() => {
      vrModel = createVRPhysicsModel();
    });

    it('contains all expected variables', () => {
      const ids = vrModel.getVariables().map(v => v.id);
      expect(ids).toContain('gravity');
      expect(ids).toContain('friction');
      expect(ids).toContain('objectMass');
      expect(ids).toContain('playerSpeed');
      expect(ids).toContain('jumpHeight');
      expect(ids).toContain('slideDistance');
      expect(ids).toContain('collisionForce');
    });

    it('has at least 5 causal edges', () => {
      expect(vrModel.getEdges().length).toBeGreaterThanOrEqual(5);
    });

    it('intervention: doubling gravity increases collision force', () => {
      const normal = vrModel.intervention('gravity', 9.8);
      const heavy  = vrModel.intervention('gravity', 19.6);
      expect(heavy.values.collisionForce).toBeGreaterThan(normal.values.collisionForce);
    });

    it('intervention: doubling gravity reduces jump height', () => {
      const normal = vrModel.intervention('gravity', 9.8);
      const heavy  = vrModel.intervention('gravity', 19.6);
      expect(heavy.values.jumpHeight).toBeLessThan(normal.values.jumpHeight);
    });

    it('intervention: higher friction reduces slide distance', () => {
      const lowFriction  = vrModel.intervention('friction', 0.1);
      const highFriction = vrModel.intervention('friction', 0.9);
      expect(highFriction.values.slideDistance).toBeLessThan(lowFriction.values.slideDistance);
    });

    it('intervention: heavier object increases collision force', () => {
      const light = vrModel.intervention('objectMass', 0.5);
      const heavy = vrModel.intervention('objectMass', 5.0);
      expect(heavy.values.collisionForce).toBeGreaterThan(light.values.collisionForce);
    });

    it('intervention: faster player increases slide distance', () => {
      const slow = vrModel.intervention('playerSpeed', 2.0);
      const fast = vrModel.intervention('playerSpeed', 10.0);
      expect(fast.values.slideDistance).toBeGreaterThan(slow.values.slideDistance);
    });

    it('runs 50+ what-if scenarios without error', () => {
      const scenarios = Array.from({ length: 50 }, (_, i) => ({
        label: `gravity-${i}`,
        variableId: 'gravity',
        value: i * 0.5,
      }));
      const results = vrModel.simulateScenarios(scenarios);
      expect(results).toHaveLength(50);
      results.forEach(r => expect(r.result.values).toBeDefined());
    });
  });
});
