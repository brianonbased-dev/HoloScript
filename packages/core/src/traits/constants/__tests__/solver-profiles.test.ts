/**
 * Solver-Backed Evidence Specification Language (SESL) — Domain Solver Profiles Tests
 *
 * Validates that each domain profile:
 * 1. Has a valid id, domain, traitSource, solver, evidenceFields, caelTrace
 * 2. Required evidence fields are correctly marked
 * 3. Registry operations work (getSolverProfile, getSolverProfileIds, etc.)
 * 4. Receipt validation catches missing required fields
 * 5. Each domain profile has the operational evidence fields the task requires
 *    (endpoint/topic/channel/device/sensor/action/state)
 *
 * @reference P17 Slice D — task_1779851876347_vgn1
 */

import { describe, it, expect } from 'vitest';
import {
  NETWORKING_AI_SOLVER_PROFILE,
  IOT_AUTONOMOUS_AGENTS_SOLVER_PROFILE,
  INTEROP_COPRESENCE_SOLVER_PROFILE,
  UNIVERSAL_SERVICE_SOLVER_PROFILE,
  ACCESSIBILITY_SOLVER_PROFILE,
  getSolverProfile,
  getSolverProfileIds,
  getAllSolverProfiles,
  getRequiredEvidenceFields,
  validateReceiptEvidence,
  type SolverProfile,
} from '../solver-profiles';

const ALL_PROFILES: SolverProfile[] = [
  NETWORKING_AI_SOLVER_PROFILE,
  IOT_AUTONOMOUS_AGENTS_SOLVER_PROFILE,
  INTEROP_COPRESENCE_SOLVER_PROFILE,
  UNIVERSAL_SERVICE_SOLVER_PROFILE,
  ACCESSIBILITY_SOLVER_PROFILE,
];

describe('SESL Solver Profiles', () => {
  describe('Profile structure', () => {
    it.each(ALL_PROFILES.map((p) => ({ profile: p, id: p.id })))(
      '$id has all required SolverProfile fields',
      ({ profile }) => {
        expect(profile.id).toBeTruthy();
        expect(profile.domain).toBeTruthy();
        expect(profile.traitSource).toBeTruthy();
        expect(profile.solver).toBeDefined();
        expect(profile.solver.solverType).toBeTruthy();
        expect(profile.solver.scale).toBeTruthy();
        expect(profile.evidenceFields).toBeInstanceOf(Array);
        expect(profile.evidenceFields.length).toBeGreaterThan(0);
        expect(profile.caelTrace).toBeDefined();
        expect(profile.caelTrace.version).toBe('cael.v1');
        expect(profile.caelTrace.eventPattern).toBeTruthy();
        expect(profile.version).toMatch(/^\d+\.\d+\.\d+$/);
        expect(profile.tags).toBeInstanceOf(Array);
        expect(profile.tags.length).toBeGreaterThan(0);
      },
    );

    it.each(ALL_PROFILES.map((p) => ({ profile: p, id: p.id })))(
      '$id has at least one required evidence field',
      ({ profile }) => {
        const requiredFields = profile.evidenceFields.filter((f) => f.required);
        expect(requiredFields.length).toBeGreaterThan(0);
      },
    );

    it.each(ALL_PROFILES.map((p) => ({ profile: p, id: p.id })))(
      '$id evidence fields have valid types',
      ({ profile }) => {
        for (const field of profile.evidenceFields) {
          expect(field.name).toBeTruthy();
          expect(field.label).toBeTruthy();
          expect(['string', 'number', 'boolean', 'object', 'array']).toContain(field.type);
          expect(typeof field.required).toBe('boolean');
          expect(field.description).toBeTruthy();
        }
      },
    );

    it.each(ALL_PROFILES.map((p) => ({ profile: p, id: p.id })))(
      '$id has at least one tag containing "sesl"',
      ({ profile }) => {
        expect(profile.tags).toContain('sesl');
      },
    );
  });

  describe('Networking AI profile', () => {
    it('has endpoint and topic evidence fields', () => {
      const names = NETWORKING_AI_SOLVER_PROFILE.evidenceFields.map((f) => f.name);
      expect(names).toContain('endpoint');
      expect(names).toContain('topic');
      expect(names).toContain('target');
      expect(names).toContain('action');
      expect(names).toContain('state');
    });

    it('requires endpoint, target, action, and state', () => {
      const required = NETWORKING_AI_SOLVER_PROFILE.evidenceFields
        .filter((f) => f.required)
        .map((f) => f.name);
      expect(required).toContain('endpoint');
      expect(required).toContain('target');
      expect(required).toContain('action');
      expect(required).toContain('state');
    });

    it('has networking-ai solver type', () => {
      expect(NETWORKING_AI_SOLVER_PROFILE.solver.solverType).toBe('networking-ai-endpoint');
      expect(NETWORKING_AI_SOLVER_PROFILE.traitSource).toBe('NETWORKING_AI_TRAITS');
    });
  });

  describe('IoT Autonomous Agents profile', () => {
    it('has device, sensor, action, and state evidence fields', () => {
      const names = IOT_AUTONOMOUS_AGENTS_SOLVER_PROFILE.evidenceFields.map((f) => f.name);
      expect(names).toContain('device');
      expect(names).toContain('sensor');
      expect(names).toContain('action');
      expect(names).toContain('state');
      expect(names).toContain('topic');
      expect(names).toContain('channel');
    });

    it('requires device, sensor, action, and state', () => {
      const required = IOT_AUTONOMOUS_AGENTS_SOLVER_PROFILE.evidenceFields
        .filter((f) => f.required)
        .map((f) => f.name);
      expect(required).toContain('device');
      expect(required).toContain('sensor');
      expect(required).toContain('action');
      expect(required).toContain('state');
    });

    it('has iot device bridge solver type', () => {
      expect(IOT_AUTONOMOUS_AGENTS_SOLVER_PROFILE.solver.solverType).toBe('iot-device-bridge');
      expect(IOT_AUTONOMOUS_AGENTS_SOLVER_PROFILE.traitSource).toBe('IOT_AUTONOMOUS_AGENTS_TRAITS');
    });
  });

  describe('Interop Co-Presence profile', () => {
    it('has channel, target, action, and state evidence fields', () => {
      const names = INTEROP_COPRESENCE_SOLVER_PROFILE.evidenceFields.map((f) => f.name);
      expect(names).toContain('channel');
      expect(names).toContain('target');
      expect(names).toContain('action');
      expect(names).toContain('state');
    });

    it('requires channel, target, action, and state', () => {
      const required = INTEROP_COPRESENCE_SOLVER_PROFILE.evidenceFields
        .filter((f) => f.required)
        .map((f) => f.name);
      expect(required).toContain('channel');
      expect(required).toContain('target');
      expect(required).toContain('action');
      expect(required).toContain('state');
    });

    it('has interop format bridge solver type', () => {
      expect(INTEROP_COPRESENCE_SOLVER_PROFILE.solver.solverType).toBe('interop-format-bridge');
      expect(INTEROP_COPRESENCE_SOLVER_PROFILE.traitSource).toBe('INTEROP_COPRESENCE_TRAITS');
    });
  });

  describe('Universal Service profile', () => {
    it('has endpoint, topic, channel, and action evidence fields', () => {
      const names = UNIVERSAL_SERVICE_SOLVER_PROFILE.evidenceFields.map((f) => f.name);
      expect(names).toContain('endpoint');
      expect(names).toContain('topic');
      expect(names).toContain('channel');
      expect(names).toContain('target');
      expect(names).toContain('action');
      expect(names).toContain('state');
    });

    it('requires endpoint, target, action, and state', () => {
      const required = UNIVERSAL_SERVICE_SOLVER_PROFILE.evidenceFields
        .filter((f) => f.required)
        .map((f) => f.name);
      expect(required).toContain('endpoint');
      expect(required).toContain('target');
      expect(required).toContain('action');
      expect(required).toContain('state');
    });

    it('has universal service runtime solver type', () => {
      expect(UNIVERSAL_SERVICE_SOLVER_PROFILE.solver.solverType).toBe('universal-service-runtime');
      expect(UNIVERSAL_SERVICE_SOLVER_PROFILE.traitSource).toBe('UNIVERSAL_V6_TRAITS');
    });
  });

  describe('Accessibility profile', () => {
    it('has target, action, state, and channel evidence fields', () => {
      const names = ACCESSIBILITY_SOLVER_PROFILE.evidenceFields.map((f) => f.name);
      expect(names).toContain('target');
      expect(names).toContain('action');
      expect(names).toContain('state');
      expect(names).toContain('channel');
    });

    it('requires target, action, and state', () => {
      const required = ACCESSIBILITY_SOLVER_PROFILE.evidenceFields
        .filter((f) => f.required)
        .map((f) => f.name);
      expect(required).toContain('target');
      expect(required).toContain('action');
      expect(required).toContain('state');
    });

    it('has accessibility audit solver type', () => {
      expect(ACCESSIBILITY_SOLVER_PROFILE.solver.solverType).toBe('accessibility-audit');
      expect(ACCESSIBILITY_SOLVER_PROFILE.traitSource).toBe('ACCESSIBILITY_TRAITS');
    });
  });

  describe('Registry operations', () => {
    it('getSolverProfile retrieves profiles by id', () => {
      expect(getSolverProfile('networking-ai')).toBe(NETWORKING_AI_SOLVER_PROFILE);
      expect(getSolverProfile('iot-autonomous-agents')).toBe(IOT_AUTONOMOUS_AGENTS_SOLVER_PROFILE);
      expect(getSolverProfile('interop-copresence')).toBe(INTEROP_COPRESENCE_SOLVER_PROFILE);
      expect(getSolverProfile('universal-service')).toBe(UNIVERSAL_SERVICE_SOLVER_PROFILE);
      expect(getSolverProfile('accessibility')).toBe(ACCESSIBILITY_SOLVER_PROFILE);
    });

    it('getSolverProfile throws for unknown profile', () => {
      expect(() => getSolverProfile('unknown-domain')).toThrow('Unknown solver profile: unknown-domain');
    });

    it('getSolverProfileIds returns all 5 profile IDs', () => {
      const ids = getSolverProfileIds();
      expect(ids).toContain('networking-ai');
      expect(ids).toContain('iot-autonomous-agents');
      expect(ids).toContain('interop-copresence');
      expect(ids).toContain('universal-service');
      expect(ids).toContain('accessibility');
      expect(ids.length).toBe(5);
    });

    it('getAllSolverProfiles returns all 5 profiles', () => {
      const profiles = getAllSolverProfiles();
      expect(profiles.length).toBe(5);
    });

    it('getRequiredEvidenceFields returns correct fields for networking-ai', () => {
      const fields = getRequiredEvidenceFields('networking-ai');
      expect(fields).toContain('endpoint');
      expect(fields).toContain('target');
      expect(fields).toContain('action');
      expect(fields).toContain('state');
    });

    it('getRequiredEvidenceFields returns empty for unknown profile', () => {
      const fields = getRequiredEvidenceFields('nonexistent');
      expect(fields).toEqual([]);
    });
  });

  describe('Receipt validation', () => {
    it('accepts receipt with all required fields for networking-ai', () => {
      const result = validateReceiptEvidence('networking-ai', {
        endpoint: 'https://api.example.com/v1',
        target: 'networked',
        action: 'invoke',
        state: 'success',
      });
      expect(result.accepted).toBe(true);
      expect(result.violations).toHaveLength(0);
    });

    it('rejects receipt missing required fields for iot-autonomous-agents', () => {
      const result = validateReceiptEvidence('iot-autonomous-agents', {
        action: 'read',
        // Missing: device, sensor, state
      });
      expect(result.accepted).toBe(false);
      expect(result.violations.length).toBeGreaterThanOrEqual(3);
      const violationFields = result.violations.map((v) => v.criterion);
      expect(violationFields).toContain('device');
      expect(violationFields).toContain('sensor');
      expect(violationFields).toContain('state');
    });

    it('accepts receipt with all required fields for accessibility', () => {
      const result = validateReceiptEvidence('accessibility', {
        target: 'screen_reader',
        action: 'verify',
        state: 'compliant',
      });
      expect(result.accepted).toBe(true);
      expect(result.violations).toHaveLength(0);
    });

    it('rejects receipt for unknown profile', () => {
      const result = validateReceiptEvidence('unknown-domain', {});
      expect(result.accepted).toBe(false);
      expect(result.violations[0].criterion).toBe('profile');
    });

    it('does not require optional fields for universal-service', () => {
      const result = validateReceiptEvidence('universal-service', {
        endpoint: '/api/v1/users',
        target: 'rest_resource',
        action: 'GET',
        state: 'success',
        // topic and channel are optional, statusCode and latencyMs are optional
      });
      expect(result.accepted).toBe(true);
    });

    it('rejects receipt missing required endpoint for universal-service', () => {
      const result = validateReceiptEvidence('universal-service', {
        target: 'rest_resource',
        action: 'GET',
        state: 'success',
        // Missing: endpoint
      });
      expect(result.accepted).toBe(false);
      expect(result.violations[0].criterion).toBe('endpoint');
    });
  });

  describe('CAEL trace configuration', () => {
    it.each(ALL_PROFILES.map((p) => ({ profile: p, id: p.id })))(
      '$id has valid CAEL trace config',
      ({ profile }) => {
        expect(profile.caelTrace.version).toBe('cael.v1');
        expect(profile.caelTrace.eventPattern).toBeTruthy();
        expect(profile.caelTrace.eventPattern).toContain(profile.id.split('-')[0]);
        expect(typeof profile.caelTrace.required).toBe('boolean');
      },
    );
  });
});