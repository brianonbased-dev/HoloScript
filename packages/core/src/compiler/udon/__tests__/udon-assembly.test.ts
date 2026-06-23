/**
 * Udon Assembly validator + renderer — Phase 1 "offline ground truth" tests.
 * The validator is the ruler; these tests prove it accepts well-formed UASM and
 * rejects every structural / resolution failure mode it claims to catch.
 */
import { describe, it, expect } from 'vitest';
import {
  renderUdonAssembly,
  validateUdonAssembly,
  type UdonAssemblyProgram,
} from '../udon-assembly';
import { UDON_RETURN_ADDRESS } from '../udon-extern-manifest';

// A hand-written, real-Udon toggle fixture — the Phase-1 golden reference.
const VALID_TOGGLE = `
.data_start
    target: %UnityEngineGameObject, null
    isActive: %SystemBoolean, null
    constTrue: %SystemBoolean, true
    constFalse: %SystemBoolean, false
.data_end

.code_start
    .export _interact
    _interact:
        PUSH, target
        PUSH, isActive
        EXTERN, "UnityEngineGameObject.__get_activeSelf__SystemBoolean"
        PUSH, isActive
        JUMP_IF_FALSE, _activate
        PUSH, target
        PUSH, constFalse
        EXTERN, "UnityEngineGameObject.__SetActive__SystemBoolean__SystemVoid"
        JUMP, 0xFFFFFFFF
        _activate:
        PUSH, target
        PUSH, constTrue
        EXTERN, "UnityEngineGameObject.__SetActive__SystemBoolean__SystemVoid"
        JUMP, 0xFFFFFFFF
.code_end
`;

describe('validateUdonAssembly', () => {
  it('accepts a well-formed toggle and resolves every EXTERN', () => {
    const v = validateUdonAssembly(VALID_TOGGLE);
    expect(v.valid).toBe(true);
    expect(v.errors).toEqual([]);
    expect(v.externs).toContain('UnityEngineGameObject.__SetActive__SystemBoolean__SystemVoid');
    expect(v.externs).toContain('UnityEngineGameObject.__get_activeSelf__SystemBoolean');
  });

  it('rejects an EXTERN signature absent from the manifest', () => {
    const broken = VALID_TOGGLE.replace(
      'UnityEngineGameObject.__SetActive__SystemBoolean__SystemVoid',
      'UnityEngineGameObject.__NotARealNode__SystemBoolean__SystemVoid'
    );
    const v = validateUdonAssembly(broken);
    expect(v.valid).toBe(false);
    expect(v.errors.some((e) => /not in manifest/.test(e))).toBe(true);
  });

  it('rejects PUSH of an undeclared heap variable', () => {
    const broken = VALID_TOGGLE.replace('PUSH, target', 'PUSH, ghostVar');
    const v = validateUdonAssembly(broken);
    expect(v.valid).toBe(false);
    expect(v.errors.some((e) => /undeclared heap variable: ghostVar/.test(e))).toBe(true);
  });

  it('rejects a jump to an unknown label', () => {
    const broken = VALID_TOGGLE.replace('JUMP_IF_FALSE, _activate', 'JUMP_IF_FALSE, _nowhere');
    const v = validateUdonAssembly(broken);
    expect(v.valid).toBe(false);
    expect(v.errors.some((e) => /_nowhere/.test(e))).toBe(true);
  });

  it('rejects an unknown opcode', () => {
    const broken = VALID_TOGGLE.replace('PUSH, target', 'YEET, target');
    const v = validateUdonAssembly(broken);
    expect(v.valid).toBe(false);
    expect(v.errors.some((e) => /unknown opcode: YEET/.test(e))).toBe(true);
  });

  it('reports a missing section', () => {
    const v = validateUdonAssembly(VALID_TOGGLE.replace('.code_end', ''));
    expect(v.valid).toBe(false);
    expect(v.errors).toContain('missing .code_end');
  });

  it('rejects sections out of order', () => {
    const reordered = `
.code_start
    .export _start
    _start:
        JUMP, 0xFFFFFFFF
.code_end
.data_start
.data_end
`;
    const v = validateUdonAssembly(reordered);
    expect(v.valid).toBe(false);
    expect(v.errors.some((e) => /out of order/.test(e))).toBe(true);
  });
});

describe('renderUdonAssembly', () => {
  it('round-trips: a rendered program validates clean', () => {
    const program: UdonAssemblyProgram = {
      heap: [{ name: 'flag', type: 'SystemBoolean', init: 'false' }],
      code: ['.export _start', '_start:', `JUMP, ${UDON_RETURN_ADDRESS}`],
    };
    const text = renderUdonAssembly(program);
    expect(text).toContain('.data_start');
    expect(text).toContain('.code_end');
    expect(validateUdonAssembly(text).valid).toBe(true);
  });
});
