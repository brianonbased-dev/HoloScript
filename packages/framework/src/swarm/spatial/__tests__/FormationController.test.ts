/**
 * FormationController Tests
 * HoloScript v3.2 - Autonomous Agent Swarms
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { FormationController } from '../FormationController';
import { Vector3 } from '../Vector3';

describe('FormationController', () => {
  let formation: FormationController;

  beforeEach(() => {
    formation = new FormationController({
      type: 'line',
      spacing: 2,
    });
  });

  describe('slot generation', () => {
    it('should generate line formation slots', () => {
      const slots = formation.generateSlots(5);
      expect(slots).toHaveLength(5);
      expect(slots[0].isLeaderSlot).toBe(true);
    });

    it('should center line formation', () => {
      const slots = formation.generateSlots(3);
      // With spacing 2 and 3 agents: positions at -2, 0, 2
      expect(slots[0].localPosition.x).toBe(-2);
      expect(slots[1].localPosition.x).toBe(0);
      expect(slots[2].localPosition.x).toBe(2);
    });

    it('should generate circle formation slots', () => {
      formation.setConfig({ type: 'circle' });
      const slots = formation.generateSlots(4);
      expect(slots).toHaveLength(4);

      // Check positions are distributed around circle
      const positions = slots.map((s) => s.localPosition);
      const firstAngle = Math.atan2(positions[0].z, positions[0].x);
      const secondAngle = Math.atan2(positions[1].z, positions[1].x);
      const angleDiff = Math.abs(secondAngle - firstAngle);
      expect(angleDiff).toBeCloseTo(Math.PI / 2, 1);
    });

    it('should generate grid formation slots', () => {
      formation.setConfig({ type: 'grid' });
      const slots = formation.generateSlots(4);
      expect(slots).toHaveLength(4);

      // 4 agents in 2x2 grid
      const positions = slots.map((s) => s.localPosition);
      const uniqueX = new Set(positions.map((p) => Math.round(p.x * 100)));
      const uniqueZ = new Set(positions.map((p) => Math.round(p.z * 100)));
      expect(uniqueX.size).toBe(2);
      expect(uniqueZ.size).toBe(2);
    });

    it('should generate wedge formation slots', () => {
      formation.setConfig({ type: 'wedge' });
      const slots = formation.generateSlots(5);
      expect(slots).toHaveLength(5);

      // Leader at front (0,0,0)
      expect(slots[0].localPosition.x).toBe(0);
      expect(slots[0].localPosition.z).toBe(0);
    });

    it('should generate diamond formation slots', () => {
      formation.setConfig({ type: 'diamond' });
      const slots = formation.generateSlots(5);
      expect(slots).toHaveLength(5);
    });

    it('should generate sphere formation slots', () => {
      formation.setConfig({ type: 'sphere' });
      const slots = formation.generateSlots(10);
      expect(slots).toHaveLength(10);

      // Positions should be in 3D (varying y values)
      const yValues = slots.map((s) => s.localPosition.y);
      const minY = Math.min(...yValues);
      const maxY = Math.max(...yValues);
      expect(maxY - minY).toBeGreaterThan(0);
    });
  });

  describe('custom formation', () => {
    it('should set custom positions', () => {
      const positions = [new Vector3(0, 0, 0), new Vector3(5, 0, 0), new Vector3(0, 5, 0)];
      formation.setCustomFormation(positions);

      const slots = formation.getAllSlots();
      expect(slots).toHaveLength(3);
      expect(slots[1].localPosition.x).toBe(5);
    });
  });

  describe('agent assignment', () => {
    beforeEach(() => {
      formation.generateSlots(5);
    });

    it('should assign agent to first available slot', () => {
      const index = formation.assignAgent('agent-1');
      expect(index).toBe(0);
    });

    it('should assign agent to specified slot', () => {
      const index = formation.assignAgent('agent-1', 3);
      expect(index).toBe(3);
    });

    it('should track agent slot', () => {
      formation.assignAgent('agent-1', 2);
      const slot = formation.getAgentSlot('agent-1');
      expect(slot?.index).toBe(2);
    });

    it('should return -1 when no slots available', () => {
      for (let i = 0; i < 5; i++) {
        formation.assignAgent(`agent-${i}`);
      }
      const index = formation.assignAgent('agent-extra');
      expect(index).toBe(-1);
    });

    it('should remove agent from slot', () => {
      formation.assignAgent('agent-1');
      expect(formation.removeAgent('agent-1')).toBe(true);
      expect(formation.getAgentSlot('agent-1')).toBeUndefined();
    });

    it('should make slot available after removal', () => {
      formation.assignAgent('agent-1', 0);
      formation.removeAgent('agent-1');
      expect(formation.getAvailableSlots()).toHaveLength(5);
    });

    it('should get agent target position', () => {
      formation.assignAgent('agent-1', 0);
      const target = formation.getAgentTarget('agent-1');
      expect(target).toBeDefined();
    });
  });

  describe('slot queries', () => {
    beforeEach(() => {
      formation.generateSlots(5);
      formation.assignAgent('agent-1', 0);
      formation.assignAgent('agent-2', 1);
    });

    it('should get available slots', () => {
      expect(formation.getAvailableSlots()).toHaveLength(3);
    });

    it('should get assigned slots', () => {
      expect(formation.getAssignedSlots()).toHaveLength(2);
    });
  });

  describe('center and rotation', () => {
    it('should update world positions when center changes', () => {
      formation.generateSlots(3);
      formation.setCenter(new Vector3(100, 0, 0));

      const slots = formation.getAllSlots();
      // All world positions should be offset by 100 in x
      expect(slots[1].worldPosition.x).toBe(100); // Center slot at x=0 + 100
    });

    it('should apply rotation', () => {
      formation.generateSlots(2);
      // Line along x axis
      const originalX = formation.getAllSlots()[0].worldPosition.x;

      formation.setRotation(Math.PI / 2); // 90 degrees

      // After rotation, x offset should become z offset
      const rotatedSlots = formation.getAllSlots();
      expect(Math.abs(rotatedSlots[0].worldPosition.z)).toBeGreaterThan(0.1);
    });

    it('should get center', () => {
      formation.setCenter(new Vector3(50, 50, 50));
      const center = formation.getCenter();
      expect(center.x).toBe(50);
    });
  });

  describe('completeness', () => {
    beforeEach(() => {
      formation.generateSlots(3);
    });

    it('should detect incomplete formation', () => {
      formation.assignAgent('agent-1');
      expect(formation.isComplete()).toBe(false);
    });

    it('should detect complete formation', () => {
      formation.assignAgent('agent-1');
      formation.assignAgent('agent-2');
      formation.assignAgent('agent-3');
      expect(formation.isComplete()).toBe(true);
    });

    it('should calculate completeness ratio', () => {
      formation.assignAgent('agent-1');
      expect(formation.getCompletenessRatio()).toBeCloseTo(0.333, 2);
    });

    it('should return 0 for empty formation', () => {
      formation = new FormationController();
      expect(formation.getCompletenessRatio()).toBe(0);
    });
  });

  describe('tightness', () => {
    beforeEach(() => {
      formation.generateSlots(3);
      formation.assignAgent('agent-1', 0);
      formation.assignAgent('agent-2', 1);
    });

    it('should calculate perfect tightness', () => {
      const slots = formation.getAllSlots();
      const positions = new Map([
        ['agent-1', slots[0].worldPosition.clone()],
        ['agent-2', slots[1].worldPosition.clone()],
      ]);

      const tightness = formation.getFormationTightness(positions);
      expect(tightness).toBe(1);
    });

    it('should calculate lower tightness for spread agents', () => {
      const slots = formation.getAllSlots();
      const positions = new Map([
        ['agent-1', slots[0].worldPosition.add(new Vector3(1, 0, 0))],
        ['agent-2', slots[1].worldPosition.add(new Vector3(1, 0, 0))],
      ]);

      const tightness = formation.getFormationTightness(positions);
      expect(tightness).toBeLessThan(1);
      expect(tightness).toBeGreaterThan(0);
    });

    it('should return 1 for no assigned agents', () => {
      formation = new FormationController();
      formation.generateSlots(3);
      expect(formation.getFormationTightness(new Map())).toBe(1);
    });
  });

  describe('optimization', () => {
    it('should optimize assignments to minimize distance', () => {
      formation.generateSlots(3);

      const positions = new Map([
        ['agent-1', new Vector3(2, 0, 0)], // Closest to slot index 2
        ['agent-2', new Vector3(-2, 0, 0)], // Closest to slot index 0
        ['agent-3', new Vector3(0, 0, 0)], // Closest to slot index 1
      ]);

      formation.optimizeAssignments(positions);

      const slot0 = formation.getAllSlots()[0];
      const slot2 = formation.getAllSlots()[2];

      // slot 0 at x=-2 should have agent-2
      expect(slot0.agentId).toBe('agent-2');
      // slot 2 at x=2 should have agent-1
      expect(slot2.agentId).toBe('agent-1');
    });
  });

  describe('configuration', () => {
    it('should update config and regenerate slots', () => {
      formation.generateSlots(3);
      formation.setConfig({ spacing: 5 });

      const slots = formation.getAllSlots();
      // With spacing 5 and 3 agents: -5, 0, 5
      expect(slots[2].localPosition.x - slots[0].localPosition.x).toBe(10);
    });

    it('should get current config', () => {
      const config = formation.getConfig();
      expect(config.type).toBe('line');
      expect(config.spacing).toBe(2);
    });
  });
});
