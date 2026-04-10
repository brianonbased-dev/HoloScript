import { describe, it, expect, beforeEach } from 'vitest';
import { HoloScriptTypeChecker } from '../HoloScriptTypeChecker';
import type { GateNode, VariableDeclarationNode, ASTNode } from '../types';

describe('HoloScript Type Guards', () => {
  let typeChecker: HoloScriptTypeChecker;

  beforeEach(() => {
    typeChecker = new HoloScriptTypeChecker();
  });

  it('should narrow type from any to number using is guard', () => {
    const varDecl: VariableDeclarationNode = {
      type: 'variable-declaration',
      kind: 'let',
      name: 'x',
      dataType: 'any',
      value: 10,
    };

    const gate: GateNode = {
      type: 'gate',
      condition: {
        type: 'type-guard',
        subject: 'x',
        guardType: 'number',
      },
      truePath: [
        {
          type: 'expression-statement',
          expression: 'x',
          position: { x: 1, y: 1, z: 0 },
        } as any,
      ],
      falsePath: [],
    };

    const result = typeChecker.check([varDecl, gate]);

    const debugDiagnostic = result.diagnostics.find((d) => d.code === 'DEBUG' && d.line === 1);
    expect(debugDiagnostic).toBeDefined();
    expect(debugDiagnostic?.message).toContain("Type of 'x' is number");
  });

  it('should revert to original type after the gate block', () => {
    const varDecl: VariableDeclarationNode = {
      type: 'variable-declaration',
      kind: 'let',
      name: 'y',
      dataType: 'string',
      value: 'hello',
    };

    const gate: GateNode = {
      type: 'gate',
      condition: {
        type: 'type-guard',
        subject: 'y',
        guardType: 'number', // Intentionally narrow to something different
      },
      truePath: [],
      falsePath: [],
    };

    const afterGate: ASTNode = {
      type: 'expression-statement',
      expression: 'y',
      position: { x: 2, y: 1, z: 0 },
    } as any;

    const result = typeChecker.check([varDecl, gate, afterGate]);

    const debugDiagnostic = result.diagnostics.find((d) => d.code === 'DEBUG' && d.line === 2);
    expect(debugDiagnostic).toBeDefined();
    expect(debugDiagnostic?.message).toContain("Type of 'y' is string");
  });
});
