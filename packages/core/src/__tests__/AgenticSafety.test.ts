import { describe, it, expect, vi } from 'vitest';
import { hitlHandler } from '../traits/HITLTrait';
import { ConstitutionalValidator } from '../utils/ConstitutionalValidator';

describe('Agentic Safety (v3.4)', () => {
  describe('ConstitutionalValidator', () => {
    it('should block critical violations by default', () => {
      const action = {
        name: 'delete_all',
        category: 'delete',
        description: 'Trying to delete all world anchors',
      };

      const result = ConstitutionalValidator.validate(action);
      expect(result.allowed).toBe(false);
      expect(result.violations[0].id).toBe('NO_GLOBAL_DELETE');
      expect(result.escalationLevel).toBe('emergency_stop');
    });

    it('should allow benign actions', () => {
      const action = {
        name: 'move_object',
        category: 'execute',
        description: 'Moving a small cube',
      };

      const result = ConstitutionalValidator.validate(action);
      expect(result.allowed).toBe(true);
    });

    it('should respect custom constitution rules', () => {
      const customRule = {
        id: 'NO_RED_CUBES',
        description: 'No creating red cubes',
        severity: 'soft' as const,
        pattern: /red cube/i,
      };

      const action = {
        name: 'create',
        category: 'write',
        description: 'Creating a Red Cube',
      };

      const result = ConstitutionalValidator.validate(action, [customRule]);
      expect(result.allowed).toBe(false);
      expect(result.violations[0].id).toBe('NO_RED_CUBES');
      expect(result.escalationLevel).toBe('soft_block');
    });
  });

  describe('HITLTrait Lifecycle', () => {
    const mockContext = {
      emit: vi.fn(),
    };

    const mockNode = {
      id: 'agent_007',
    };

    it('should catch constitutional violations and emit event', () => {
      const config = {
        ...hitlHandler.defaultConfig,
        mode: 'autonomous' as const,
      };

      hitlHandler.onAttach!(mockNode as any, config, mockContext as any);

      const violationEvent = {
        type: 'agent_action_request',
        payload: {
          action: 'delete_all',
          category: 'delete',
          confidence: 0.9,
          riskScore: 0.1,
          description: 'Nuclear option',
          metadata: {},
        },
      };

      hitlHandler.onEvent!(mockNode as any, config, mockContext as any, violationEvent as any);

      // Should be blocked despite high confidence
      expect(mockContext.emit).toHaveBeenCalledWith('hitl_violation_caught', expect.anything());
      expect(mockContext.emit).toHaveBeenCalledWith('hitl_approval_required', expect.anything());
    });

    it('should implement stateful permission thresholds', () => {
      const config = {
        ...hitlHandler.defaultConfig,
        mode: 'supervised' as const,
        confidence_threshold: 0.8,
      };

      hitlHandler.onAttach!(mockNode as any, config, mockContext as any);
      const state = (mockNode as any).__hitlState;

      // Simulate 5 approvals for a specific action
      const permKey = 'execute:paint_wall';
      state.permissions[permKey] = { approvals: 5, confidenceBonus: 0.05 };

      const actionEvent = {
        type: 'agent_action_request',
        payload: {
          action: 'paint_wall',
          category: 'execute',
          confidence: 0.77, // Below 0.8 base, but 0.77 + 0.05 = 0.82
          riskScore: 0.1,
          description: 'Painting stuff',
          metadata: {},
        },
      };

      hitlHandler.onEvent!(mockNode as any, config, mockContext as any, actionEvent as any);

      // Should be auto-approved due to bonus
      expect(mockContext.emit).toHaveBeenCalledWith(
        'hitl_action_approved',
        expect.objectContaining({
          autonomous: true,
        })
      );
    });
  });
});
