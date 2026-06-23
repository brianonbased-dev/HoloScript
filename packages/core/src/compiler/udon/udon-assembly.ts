/**
 * Udon Assembly (UASM) program model, renderer, and offline validator.
 *
 * Phase 1 of the HoloScript → "Byte" (VRChat Udon) roadmap. The validator is the
 * "ruler" built before the codegen it measures: it confirms a UASM string is
 * structurally well-formed and that every `EXTERN` resolves against a node manifest —
 * gate-enforced, not asserted. It operates on rendered text, so it validates any UASM
 * regardless of how it was produced (hand-written fixtures or compiler output).
 *
 * It does NOT validate Unity runtime semantics — that is the Phase-3 headless Unity CI
 * round-trip. This is the offline, no-Unity correctness floor.
 */

import {
  UDON_OPCODES,
  UDON_RETURN_ADDRESS,
  UDON_EXTERN_MANIFEST_SEED,
  type UdonExternManifest,
} from './udon-extern-manifest';

/** A typed heap variable in a Udon Assembly `.data` section. */
export interface UdonHeapVar {
  /** Symbol name referenced by PUSH. */
  readonly name: string;
  /** Udon type token without the leading `%`, e.g. 'SystemBoolean', 'UnityEngineGameObject'. */
  readonly type: string;
  /** Initial heap value: 'null', 'this', 'true', 'false', or a literal. */
  readonly init: string;
}

/**
 * A renderable Udon Assembly program. `code` entries are raw assembly lines:
 * label definitions (`name:`), `.export name`, and `OPCODE[, operand]` instructions.
 */
export interface UdonAssemblyProgram {
  readonly heap: readonly UdonHeapVar[];
  readonly code: readonly string[];
}

export interface UdonAssemblyValidation {
  readonly valid: boolean;
  readonly errors: string[];
  /** Deduped EXTERN signatures encountered (whether or not they resolved). */
  readonly externs: string[];
}

const INDENT = '    ';
const LABEL_DEF = /^[A-Za-z_]\w*:$/;
const DATA_DECL = /^([A-Za-z_]\w*):\s*%([A-Za-z_]\w*),\s*(.+)$/;
const EXPORT_DIRECTIVE = /^\.export\s+([A-Za-z_]\w*)$/;
const INSTRUCTION = /^([A-Z_]+)(?:,\s*(.+))?$/;
const HEX_ADDRESS = /^0x[0-9A-Fa-f]+$/;

/** Render a program to canonical `.data_start/.code_start` Udon Assembly text. */
export function renderUdonAssembly(program: UdonAssemblyProgram): string {
  const lines: string[] = [];
  lines.push('.data_start');
  for (const v of program.heap) {
    lines.push(`${INDENT}${v.name}: %${v.type}, ${v.init}`);
  }
  lines.push('.data_end');
  lines.push('');
  lines.push('.code_start');
  for (const c of program.code) {
    lines.push(`${INDENT}${c}`);
  }
  lines.push('.code_end');
  lines.push('');
  return lines.join('\n');
}

/**
 * Validate a Udon Assembly string: section structure + opcode set + symbol/label/EXTERN
 * resolution. Returns all errors found (not just the first) plus the EXTERN signatures seen.
 */
export function validateUdonAssembly(
  uasm: string,
  manifest: UdonExternManifest = UDON_EXTERN_MANIFEST_SEED
): UdonAssemblyValidation {
  const errors: string[] = [];
  const externSet = new Set<string>();

  // Strip `#` comments and blank lines.
  const lines = uasm
    .split('\n')
    .map((l) => {
      const hash = l.indexOf('#');
      return (hash >= 0 ? l.slice(0, hash) : l).trim();
    })
    .filter((l) => l.length > 0);

  const dataStart = lines.indexOf('.data_start');
  const dataEnd = lines.indexOf('.data_end');
  const codeStart = lines.indexOf('.code_start');
  const codeEnd = lines.indexOf('.code_end');

  if (dataStart < 0) errors.push('missing .data_start');
  if (dataEnd < 0) errors.push('missing .data_end');
  if (codeStart < 0) errors.push('missing .code_start');
  if (codeEnd < 0) errors.push('missing .code_end');
  if (errors.length > 0) return { valid: false, errors, externs: [] };

  if (!(dataStart < dataEnd && dataEnd < codeStart && codeStart < codeEnd)) {
    errors.push(
      'sections out of order: expected .data_start < .data_end < .code_start < .code_end'
    );
    return { valid: false, errors, externs: [] };
  }

  // --- data section: collect declared heap symbols ---
  const declared = new Set<string>();
  for (let i = dataStart + 1; i < dataEnd; i++) {
    const line = lines[i];
    const m = DATA_DECL.exec(line);
    if (!m) {
      errors.push(`malformed data declaration: "${line}" (expected "name: %Type, init")`);
      continue;
    }
    if (declared.has(m[1])) errors.push(`duplicate heap variable: ${m[1]}`);
    declared.add(m[1]);
  }

  // --- code section pass 1: collect labels (allow forward references) ---
  const labels = new Set<string>();
  for (let i = codeStart + 1; i < codeEnd; i++) {
    const m = LABEL_DEF.exec(lines[i]);
    if (m) {
      const name = lines[i].slice(0, -1);
      if (labels.has(name)) errors.push(`duplicate label: ${name}`);
      labels.add(name);
    }
  }

  // --- code section pass 2: validate directives + instructions ---
  for (let i = codeStart + 1; i < codeEnd; i++) {
    const line = lines[i];
    if (LABEL_DEF.test(line)) continue;

    const exp = EXPORT_DIRECTIVE.exec(line);
    if (exp) {
      if (!labels.has(exp[1])) errors.push(`.export references unknown label: ${exp[1]}`);
      continue;
    }

    const ins = INSTRUCTION.exec(line);
    if (!ins) {
      errors.push(`malformed code line: "${line}"`);
      continue;
    }
    const op = ins[1];
    const operand = ins[2]?.trim();
    if (!UDON_OPCODES.has(op)) {
      errors.push(`unknown opcode: ${op}`);
      continue;
    }

    switch (op) {
      case 'PUSH':
        if (!operand) {
          errors.push('PUSH requires a heap-variable operand');
        } else if (!declared.has(operand)) {
          errors.push(`PUSH references undeclared heap variable: ${operand}`);
        }
        break;
      case 'EXTERN': {
        if (!operand) {
          errors.push('EXTERN requires a signature operand');
          break;
        }
        const sig = operand.replace(/^"|"$/g, '');
        externSet.add(sig);
        if (!manifest.signatures.has(sig)) {
          errors.push(`EXTERN signature not in manifest (sdk ${manifest.sdkVersion}): ${sig}`);
        }
        break;
      }
      case 'JUMP':
      case 'JUMP_IF_FALSE':
        if (!operand) {
          errors.push(`${op} requires a target operand`);
        } else if (
          operand !== UDON_RETURN_ADDRESS &&
          !labels.has(operand) &&
          !HEX_ADDRESS.test(operand)
        ) {
          errors.push(`${op} target is neither a known label nor an address: ${operand}`);
        }
        break;
      // NOP, POP, COPY, JUMP_INDIRECT, ANNOTATION: stack/heap-driven, no inline-operand
      // resolution in the seed validator.
      default:
        break;
    }
  }

  return { valid: errors.length === 0, errors, externs: [...externSet] };
}
