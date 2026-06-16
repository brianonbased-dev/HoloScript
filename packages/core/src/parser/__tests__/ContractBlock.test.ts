/**
 * Tests for SimulationContract block (v6.3)
 *
 * Covers:
 * - Parsing a `sim_contract {}` with preconditions, invariants, and receipt
 * - AST shape matching HoloContract interface
 * - Integration with HoloComposition (`composition.contract`)
 * - Parsing in implicit (no `composition` wrapper) context
 * - Edge cases: empty block, only receipt, description on clause
 *
 * @version 6.3.0
 */

import { describe, it, expect } from 'vitest';
import { parseHolo } from '../HoloCompositionParser';
import type { HoloContract, HoloContractClause } from '../HoloCompositionTypes';

// =============================================================================
// PARSER TESTS
// =============================================================================

describe('SimulationContract block — parser', () => {
  describe('Full contract block inside composition', () => {
    it('parses preconditions, invariants, and receipt', () => {
      const source = `
        composition "ArenaMatch" {
          sim_contract {
            precondition "gravity_set" { gravity != null }
            precondition "arena_bounded" { arena.radius > 0 }
            invariant "energy_conserved" { total_energy <= initial_energy + 0.001 }
            receipt { winner: string, final_score: number, elapsed_ms: number }
          }
        }
      `;

      const result = parseHolo(source);
      expect(result.success).toBe(true);

      const contract = result.ast?.contract;
      expect(contract).toBeDefined();
      expect(contract!.type).toBe('contract');

      // Preconditions
      expect(contract!.preconditions).toHaveLength(2);
      const p0 = contract!.preconditions[0];
      expect(p0.name).toBe('gravity_set');
      expect(p0.expr).toContain('gravity');

      const p1 = contract!.preconditions[1];
      expect(p1.name).toBe('arena_bounded');
      // Lexer splits 'arena.radius' into tokens separated by spaces; the
      // expression reconstructs them joined with spaces.
      expect(p1.expr).toContain('arena');

      // Invariants
      expect(contract!.invariants).toHaveLength(1);
      const inv0 = contract!.invariants[0];
      expect(inv0.name).toBe('energy_conserved');
      expect(inv0.expr).toContain('total_energy');

      // Receipt
      expect(contract!.receipt).toEqual({
        winner: 'string',
        final_score: 'number',
        elapsed_ms: 'number',
      });
    });

    it('attaches contract to composition.contract field', () => {
      const source = `
        composition "Test" {
          sim_contract {
            precondition "ready" { state.ready == true }
            receipt { result: boolean }
          }
        }
      `;

      const result = parseHolo(source);
      expect(result.success).toBe(true);
      expect(result.ast!.contract).toBeDefined();
      expect(result.ast!.contract!.preconditions[0].name).toBe('ready');
    });
  });

  describe('Clause with optional description', () => {
    it('parses precondition with description string', () => {
      const source = `
        composition "WithDesc" {
          sim_contract {
            precondition "gravity_set" "Gravity must be configured before the match begins" { gravity != null }
          }
        }
      `;

      const result = parseHolo(source);
      expect(result.success).toBe(true);
      const clause = result.ast!.contract!.preconditions[0];
      expect(clause.name).toBe('gravity_set');
      expect(clause.description).toContain('Gravity must be configured');
      expect(clause.expr).toContain('gravity');
    });

    it('parses invariant with description string', () => {
      const source = `
        composition "InvDesc" {
          sim_contract {
            invariant "no_negative_health" "Player health must remain non-negative throughout" { player.health >= 0 }
          }
        }
      `;

      const result = parseHolo(source);
      expect(result.success).toBe(true);
      const clause = result.ast!.contract!.invariants[0];
      expect(clause.name).toBe('no_negative_health');
      expect(clause.description).toContain('non-negative');
    });
  });

  describe('Receipt-only contract', () => {
    it('parses a contract with only a receipt block', () => {
      const source = `
        composition "ReceiptOnly" {
          sim_contract {
            receipt { score: number, timestamp: string }
          }
        }
      `;

      const result = parseHolo(source);
      expect(result.success).toBe(true);
      const contract = result.ast!.contract!;
      expect(contract.preconditions).toHaveLength(0);
      expect(contract.invariants).toHaveLength(0);
      expect(contract.receipt.score).toBe('number');
      expect(contract.receipt.timestamp).toBe('string');
    });
  });

  describe('Empty contract block', () => {
    it('parses an empty sim_contract block without errors', () => {
      const source = `
        composition "Empty" {
          sim_contract {}
        }
      `;

      const result = parseHolo(source);
      // Tolerant parser: no hard failure, but contract should be present
      const contract = result.ast?.contract;
      expect(contract).toBeDefined();
      expect(contract!.preconditions).toHaveLength(0);
      expect(contract!.invariants).toHaveLength(0);
      expect(contract!.receipt).toEqual({});
    });
  });

  describe('Multiple preconditions and invariants', () => {
    it('parses all clauses into correct arrays', () => {
      const source = `
        composition "Multi" {
          sim_contract {
            precondition "check_a" { a > 0 }
            precondition "check_b" { b != null }
            precondition "check_c" { c.length > 0 }
            invariant "inv_x" { x <= max_x }
            invariant "inv_y" { y >= 0 }
            receipt { status: string, count: number }
          }
        }
      `;

      const result = parseHolo(source);
      expect(result.success).toBe(true);

      const contract = result.ast!.contract!;
      expect(contract.preconditions).toHaveLength(3);
      expect(contract.invariants).toHaveLength(2);

      const names = contract.preconditions.map((c: HoloContractClause) => c.name);
      expect(names).toEqual(['check_a', 'check_b', 'check_c']);

      const invNames = contract.invariants.map((c: HoloContractClause) => c.name);
      expect(invNames).toEqual(['inv_x', 'inv_y']);
    });
  });

  describe('Type shape', () => {
    it('contract node has type === contract', () => {
      const source = `
        composition "TypeCheck" {
          sim_contract {
            precondition "p" { true }
          }
        }
      `;
      const result = parseHolo(source);
      const c = result.ast?.contract as HoloContract;
      expect(c).toBeDefined();
      expect(c.type).toBe('contract');
      expect(Array.isArray(c.preconditions)).toBe(true);
      expect(Array.isArray(c.invariants)).toBe(true);
      expect(typeof c.receipt).toBe('object');
    });
  });

  describe('Coexistence with other blocks', () => {
    it('parses sim_contract alongside other composition blocks', () => {
      const source = `
        composition "FullWorld" {
          environment {
            sky_color: "#000022"
          }
          sim_contract {
            precondition "initialized" { world.ready == true }
            receipt { session_id: string }
          }
          object "Arena" {
            shape: "sphere"
          }
        }
      `;

      const result = parseHolo(source);
      expect(result.success).toBe(true);
      expect(result.ast!.contract).toBeDefined();
      expect(result.ast!.objects.length).toBe(1);
      expect(result.ast!.environment).toBeDefined();
    });
  });
});
