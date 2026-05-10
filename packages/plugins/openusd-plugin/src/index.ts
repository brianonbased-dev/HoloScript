/**
 * @holoscript/openusd-plugin — OpenUSD interop baseline.
 *
 * Targets the paper-12 "OpenUSD proxy LOC" bucket by providing a real USDA
 * export from a .holo composition tree. Current scope: deterministic USDA
 * export, semantic receipt emission, optional pxr/usdchecker validation, and
 * deterministic round-trip conformance checks that do not require local pxr
 * bindings.
 *
 * Status: BASELINE+OPTIONAL_PXR. pxr/usdchecker validation is opt-in.
 * Research: ai-ecosystem/research/2026-04-23_openusd-holoscript-robotics-frontend.md
 * Paper:    memory/paper-12-plugin-openusd-probe.md
 */

import { spawnSync } from 'child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

export type UsdaStageKind = 'world' | 'anim' | 'look';
export type UsdaPrimitiveKind = 'xform' | 'mesh' | 'light';
export type UsdaAttrValue = string | number | boolean | number[];

export interface UsdaSemanticReceipt {
  role: string;
  sourcePath: string;
  dtId?: string;
  units?: string;
  telemetry?: string[];
  simulationContract?: string;
  provenance?: string;
}

export interface UsdaPrimitiveInput {
  kind: UsdaPrimitiveKind;
  path: string;
  attrs?: Record<string, UsdaAttrValue>;
  semantic?: UsdaSemanticReceipt;
}

export interface UsdaExportInput {
  name: string;
  stage?: UsdaStageKind;
  upAxis?: 'Y' | 'Z';
  metersPerUnit?: number;
  defaultPrim?: string;
  customData?: Record<string, string>;
  primitives?: UsdaPrimitiveInput[];
}

export interface UsdaExportOutput {
  usda: string;
  loc: number;
  primitive_count: number;
  semantic_receipt_count: number;
  semantic_hash: string;
}

export interface UsdaRoundTripSummary {
  primitiveNames: string[];
  semanticSourcePaths: string[];
  semanticRoles: string[];
  semanticHash?: string;
}

export interface UsdaConformanceCheck {
  id: string;
  passed: boolean;
  message: string;
}

export type UsdaConformanceValidator = 'syntax-roundtrip' | 'pxr.usdchecker';
export type UsdaConformanceReceiptStatus = 'passed' | 'failed' | 'unavailable';
export type UsdaConformanceMode = 'syntax-roundtrip' | 'pxr-usdchecker';

export interface UsdaConformanceReceipt {
  validator: UsdaConformanceValidator;
  status: UsdaConformanceReceiptStatus;
  mode: UsdaConformanceMode;
  semantic_hash: string;
  primitive_count: number;
  message: string;
  command?: string;
  exitCode?: number | null;
  signal?: string | null;
  stdout?: string;
  stderr?: string;
}

export interface UsdCheckerProcessResult {
  status?: number | null;
  signal?: string | null;
  stdout?: unknown;
  stderr?: unknown;
  error?: unknown;
}

export interface UsdCheckerRunOptions {
  timeoutMs: number;
}

export type UsdCheckerRunner = (
  command: string,
  args: string[],
  options: UsdCheckerRunOptions
) => UsdCheckerProcessResult;

export interface UsdCheckerValidationOptions {
  enabled?: boolean;
  command?: string;
  args?: string[];
  timeoutMs?: number;
  runner?: UsdCheckerRunner;
}

export interface UsdaConformanceOptions {
  usdchecker?: UsdCheckerValidationOptions;
}

export interface UsdaConformanceReport {
  passed: boolean;
  checks: UsdaConformanceCheck[];
  receipts: UsdaConformanceReceipt[];
  validationMode: UsdaConformanceMode;
  output: UsdaExportOutput;
  roundTrip: UsdaRoundTripSummary;
}

/**
 * Export a minimal .holo-derived scene to USDA (ASCII USD) text.
 * Structure is valid USDA text; HoloScript semantics are preserved as custom
 * namespaced attributes so Omniverse/USD ingestion can round-trip receipts.
 */
export function exportToUsda(input: UsdaExportInput): UsdaExportOutput {
  const lines: string[] = [];
  const defaultPrim = sanitizeIdentifier(input.defaultPrim ?? 'World');
  const upAxis = input.upAxis ?? 'Y';
  const metersPerUnit = input.metersPerUnit ?? 1.0;
  const stage = input.stage ?? 'world';
  const semanticHash = stableHash(input);

  lines.push('#usda 1.0');
  lines.push('(');
  lines.push(`  defaultPrim = "${defaultPrim}"`);
  lines.push(`  metersPerUnit = ${formatNumber(metersPerUnit)}`);
  lines.push(`  upAxis = "${upAxis}"`);
  lines.push(')');
  lines.push('');
  lines.push(`def Xform "${defaultPrim}"`);
  lines.push('{');
  lines.push(`    custom string holo:sourceName = "${escapeUsdString(input.name)}"`);
  lines.push(`    custom string holo:stage = "${stage}"`);
  lines.push(`    custom string holo:semanticHash = "${semanticHash}"`);

  for (const [key, value] of Object.entries(input.customData ?? {})) {
    lines.push(`    custom string holo:${sanitizeIdentifier(key)} = "${escapeUsdString(value)}"`);
  }

  const prims: UsdaPrimitiveInput[] = input.primitives ?? [{ kind: 'xform', path: 'root' }];
  for (const prim of prims) {
    const typeName =
      prim.kind === 'mesh' ? 'Mesh' : prim.kind === 'light' ? 'SphereLight' : 'Xform';
    lines.push(`    def ${typeName} "${sanitizeIdentifier(prim.path)}"`);
    lines.push('    {');
    lines.push(`        custom string holo:sourcePath = "${escapeUsdString(prim.path)}"`);

    if (prim.semantic) {
      pushSemanticReceipt(lines, prim.semantic, '        ');
    }

    for (const [k, v] of Object.entries(prim.attrs ?? {})) {
      lines.push(formatUsdAttribute(k, v, '        '));
    }
    lines.push('    }');
  }

  lines.push('}');
  lines.push('');

  const usda = lines.join('\n');
  const loc = lines.filter((l) => l.trim().length > 0).length;
  const semanticReceiptCount = prims.filter((p) => p.semantic).length;
  return {
    usda,
    loc,
    primitive_count: input.primitives?.length ?? 1,
    semantic_receipt_count: semanticReceiptCount,
    semantic_hash: semanticHash,
  };
}

/** Minimal round-trip probe — re-parse emitted USDA to verify syntactic stability. */
export function usdaStableRoundTrip(input: UsdaExportInput): boolean {
  const out = exportToUsda(input);
  // Stub check: every declared primitive's sanitized path appears in the emitted text.
  const prims = input.primitives ?? [];
  for (const p of prims) {
    const sanitized = sanitizeIdentifier(p.path);
    if (!out.usda.includes(`"${sanitized}"`)) return false;
  }
  return true;
}

export function summarizeUsdaRoundTrip(usda: string): UsdaRoundTripSummary {
  const primitiveNames = [...usda.matchAll(/def\s+\w+\s+"([^"]+)"/g)].map((m) => m[1]);
  const semanticSourcePaths = [...usda.matchAll(/custom string holo:sourcePath = "([^"]+)"/g)].map(
    (m) => unescapeUsdString(m[1])
  );
  const semanticRoles = [...usda.matchAll(/custom string holo:role = "([^"]+)"/g)].map((m) =>
    unescapeUsdString(m[1])
  );
  const semanticHash = usda.match(/custom string holo:semanticHash = "([^"]+)"/)?.[1];

  return {
    primitiveNames,
    semanticSourcePaths,
    semanticRoles,
    semanticHash,
  };
}

export function runOpenUsdConformanceRoundTrip(
  input: UsdaExportInput,
  options: UsdaConformanceOptions = {}
): UsdaConformanceReport {
  const output = exportToUsda(input);
  const roundTrip = summarizeUsdaRoundTrip(output.usda);
  const prims = input.primitives ?? [{ kind: 'xform' as const, path: 'root' }];
  const semanticPrims = prims.filter((p) => p.semantic);
  const checks: UsdaConformanceCheck[] = [];

  const add = (id: string, passed: boolean, message: string) =>
    checks.push({ id, passed, message });

  add('magic-header', output.usda.startsWith('#usda 1.0'), 'USDA file starts with #usda 1.0');
  add(
    'default-prim',
    output.usda.includes(`defaultPrim = "${sanitizeIdentifier(input.defaultPrim ?? 'World')}"`),
    'Default prim is declared in the layer preamble'
  );
  add('up-axis', /upAxis = "[YZ]"/.test(output.usda), 'Stage declares a USD upAxis');
  add('meters-per-unit', /metersPerUnit = \d/.test(output.usda), 'Stage declares metersPerUnit');
  add(
    'primitive-count',
    output.primitive_count === prims.length,
    'Output primitive_count matches declared primitive count'
  );
  add(
    'primitive-roundtrip',
    prims.every((p) => roundTrip.primitiveNames.includes(sanitizeIdentifier(p.path))),
    'Every declared primitive survives USDA reparse by sanitized name'
  );
  add(
    'semantic-source-paths',
    prims.every((p) => roundTrip.semanticSourcePaths.includes(p.path)),
    'Every primitive sourcePath receipt survives USDA reparse'
  );
  add(
    'semantic-receipts',
    output.semantic_receipt_count === semanticPrims.length &&
      semanticPrims.every((p) => roundTrip.semanticRoles.includes(p.semantic!.role)),
    'Every semantic receipt role survives USDA reparse'
  );
  add(
    'semantic-hash',
    roundTrip.semanticHash === output.semantic_hash,
    'Root semantic hash survives USDA reparse'
  );

  const syntaxPassed = checks.every((check) => check.passed);
  const receipts: UsdaConformanceReceipt[] = [
    {
      validator: 'syntax-roundtrip',
      status: syntaxPassed ? 'passed' : 'failed',
      mode: 'syntax-roundtrip',
      semantic_hash: output.semantic_hash,
      primitive_count: output.primitive_count,
      message: syntaxPassed
        ? 'Deterministic USDA syntax round-trip passed without requiring pxr bindings'
        : 'Deterministic USDA syntax round-trip failed',
    },
  ];

  const usdcheckerReceipt = runOptionalUsdChecker(output, options.usdchecker);
  if (usdcheckerReceipt) {
    receipts.push(usdcheckerReceipt);
    add('pxr-usdchecker', usdcheckerReceipt.status !== 'failed', usdcheckerReceipt.message);
  }

  const validationMode = receipts.some(
    (receipt) => receipt.validator === 'pxr.usdchecker' && receipt.status === 'passed'
  )
    ? 'pxr-usdchecker'
    : 'syntax-roundtrip';

  return {
    passed: checks.every((check) => check.passed),
    checks,
    receipts,
    validationMode,
    output,
    roundTrip,
  };
}

export function buildIndustrialDigitalTwinFixture(): UsdaExportInput {
  return {
    name: 'HoloScriptFactoryCellTwin',
    stage: 'world',
    upAxis: 'Z',
    metersPerUnit: 1,
    defaultPrim: 'FactoryCell',
    customData: {
      domain: 'industrial_digital_twin',
      targetRuntime: 'omniverse_openusd',
      evidence: 'semantic_receipts_required',
    },
    primitives: [
      {
        kind: 'xform',
        path: '/FactoryCell',
        semantic: {
          role: 'factory_cell',
          sourcePath: 'examples/openusd/industrial-factory-cell.holo',
          dtId: 'dtmi:holoscript:factory:cell;1',
          units: 'SI',
          simulationContract: 'fixed_dt_60hz;z_up;semantic_receipts_required',
        },
      },
      {
        kind: 'mesh',
        path: '/FactoryCell/LineA/Conveyor',
        attrs: { position: [0, 0.5, 0], scale: [8, 1, 1.5], material: 'conveyor_belt' },
        semantic: {
          role: 'conveyor',
          sourcePath: 'object:ConveyorLineA',
          dtId: 'dt:conveyor:lineA:belt1',
          units: 'm/s',
          telemetry: ['speed', 'vibration', 'temperature'],
          simulationContract: 'kinematic_belt;collision_bounds_preserved',
        },
      },
      {
        kind: 'mesh',
        path: '/FactoryCell/LineA/MotorM001',
        attrs: { position: [-4.5, 0.8, 0], rpm: 1450, powerKW: 2.2 },
        semantic: {
          role: 'motor',
          sourcePath: 'object:MotorM001',
          dtId: 'dt:motor:lineA:m001',
          units: 'rpm,kW',
          telemetry: ['current', 'temperature', 'vibrationRMS'],
          simulationContract: 'predictive_maintenance_receipt_required',
        },
      },
      {
        kind: 'xform',
        path: '/FactoryCell/LineA/VibrationSensor',
        attrs: { position: [-2, 1.25, -0.9], samplingHz: 1000 },
        semantic: {
          role: 'sensor',
          sourcePath: 'object:VibrationSensorA',
          dtId: 'dt:sensor:vibration:lineA:s001',
          units: 'mm/s',
          telemetry: ['x', 'y', 'z'],
          simulationContract: 'telemetry_replay_receipt_required',
        },
      },
      {
        kind: 'mesh',
        path: '/FactoryCell/Safety/Cage',
        attrs: { position: [0, 1, -3], scale: [10, 2, 0.1], material: 'safety_fence' },
        semantic: {
          role: 'safety_boundary',
          sourcePath: 'object:SafetyCage',
          dtId: 'dt:safety:cellA:cage',
          units: 'meters',
          simulationContract: 'collision_bounds_preserved;interlock_zone',
        },
      },
      {
        kind: 'xform',
        path: '/FactoryCell/Assembly/CobotArm',
        attrs: { position: [3, 1.5, -2], payloadKg: 5, reachM: 0.85 },
        semantic: {
          role: 'robot_actor',
          sourcePath: 'object:CobotArm',
          dtId: 'dt:cobot:assembly:cb001',
          units: 'kg,m',
          telemetry: ['joint_state', 'tool_pose', 'safety_stop'],
          simulationContract: 'articulation_root;replayable_joint_commands',
        },
      },
      {
        kind: 'light',
        path: '/FactoryCell/Inspection/QualityLight',
        attrs: { position: [0, 3, 0], intensity: 6500 },
        semantic: {
          role: 'inspection_light',
          sourcePath: 'object:QualityLight',
          dtId: 'dt:inspection:light:q001',
          units: 'lumens',
          simulationContract: 'vision_pipeline_lighting_receipt',
        },
      },
    ],
  };
}

function pushSemanticReceipt(lines: string[], semantic: UsdaSemanticReceipt, indent: string) {
  lines.push(`${indent}custom string holo:role = "${escapeUsdString(semantic.role)}"`);
  lines.push(
    `${indent}custom string holo:semanticSource = "${escapeUsdString(semantic.sourcePath)}"`
  );

  if (semantic.dtId)
    lines.push(`${indent}custom string holo:dtId = "${escapeUsdString(semantic.dtId)}"`);
  if (semantic.units)
    lines.push(`${indent}custom string holo:units = "${escapeUsdString(semantic.units)}"`);
  if (semantic.telemetry?.length) {
    lines.push(
      `${indent}custom string holo:telemetry = "${escapeUsdString(semantic.telemetry.join(','))}"`
    );
  }
  if (semantic.simulationContract) {
    lines.push(
      `${indent}custom string holo:simulationContract = "${escapeUsdString(semantic.simulationContract)}"`
    );
  }
  if (semantic.provenance) {
    lines.push(
      `${indent}custom string holo:provenance = "${escapeUsdString(semantic.provenance)}"`
    );
  }
}

function runOptionalUsdChecker(
  output: UsdaExportOutput,
  options?: UsdCheckerValidationOptions
): UsdaConformanceReceipt | undefined {
  if (!options?.enabled) return undefined;

  const command = options.command ?? process.env.HOLOSCRIPT_USDCHECKER ?? 'usdchecker';
  const timeoutMs = options.timeoutMs ?? 10_000;
  const runner = options.runner ?? runUsdCheckerProcess;
  let tempDir: string | undefined;

  try {
    tempDir = mkdtempSync(join(tmpdir(), 'holoscript-openusd-'));
    const stagePath = join(tempDir, 'stage.usda');
    writeFileSync(stagePath, output.usda, 'utf8');

    const result = runner(command, [...(options.args ?? []), stagePath], { timeoutMs });
    const errorCode = getErrorCode(result.error);
    const stdout = normalizeProcessOutput(result.stdout);
    const stderr = normalizeProcessOutput(result.stderr);

    if (errorCode === 'ENOENT') {
      return {
        validator: 'pxr.usdchecker',
        status: 'unavailable',
        mode: 'syntax-roundtrip',
        semantic_hash: output.semantic_hash,
        primitive_count: output.primitive_count,
        command,
        message: `${command} was not found; deterministic syntax round-trip fallback used`,
      };
    }

    if (result.error) {
      return {
        validator: 'pxr.usdchecker',
        status: 'failed',
        mode: 'pxr-usdchecker',
        semantic_hash: output.semantic_hash,
        primitive_count: output.primitive_count,
        command,
        exitCode: result.status ?? null,
        signal: result.signal ?? null,
        stdout,
        stderr,
        message: `${command} could not complete: ${getErrorMessage(result.error)}`,
      };
    }

    const passed = result.status === 0;
    return {
      validator: 'pxr.usdchecker',
      status: passed ? 'passed' : 'failed',
      mode: 'pxr-usdchecker',
      semantic_hash: output.semantic_hash,
      primitive_count: output.primitive_count,
      command,
      exitCode: result.status ?? null,
      signal: result.signal ?? null,
      stdout,
      stderr,
      message: passed
        ? `${command} accepted the emitted USDA stage`
        : `${command} rejected the emitted USDA stage`,
    };
  } catch (error) {
    return {
      validator: 'pxr.usdchecker',
      status: 'failed',
      mode: 'pxr-usdchecker',
      semantic_hash: output.semantic_hash,
      primitive_count: output.primitive_count,
      command,
      message: `Unable to prepare ${command} validation: ${getErrorMessage(error)}`,
    };
  } finally {
    if (tempDir) rmSync(tempDir, { recursive: true, force: true });
  }
}

function runUsdCheckerProcess(
  command: string,
  args: string[],
  options: UsdCheckerRunOptions
): UsdCheckerProcessResult {
  const result = spawnSync(command, args, {
    encoding: 'utf8',
    timeout: options.timeoutMs,
    windowsHide: true,
  });
  return {
    status: result.status,
    signal: result.signal,
    stdout: result.stdout,
    stderr: result.stderr,
    error: result.error,
  };
}

function formatUsdAttribute(key: string, value: UsdaAttrValue, indent: string): string {
  const attrName = sanitizeIdentifier(key);
  if (Array.isArray(value))
    return `${indent}float3 ${attrName} = (${value.map(formatNumber).join(', ')})`;
  if (typeof value === 'number') return `${indent}float ${attrName} = ${formatNumber(value)}`;
  if (typeof value === 'boolean') return `${indent}bool ${attrName} = ${value ? 'true' : 'false'}`;
  return `${indent}string ${attrName} = "${escapeUsdString(value)}"`;
}

function sanitizeIdentifier(value: string): string {
  const sanitized = value.replace(/\W/g, '_').replace(/^_+/, '');
  const nonEmpty = sanitized.length ? sanitized : 'Prim';
  return /^[A-Za-z_]/.test(nonEmpty) ? nonEmpty : `_${nonEmpty}`;
}

function escapeUsdString(value: string): string {
  return String(value).replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

function unescapeUsdString(value: string): string {
  return value.replace(/\\"/g, '"').replace(/\\\\/g, '\\');
}

function formatNumber(value: number): string {
  if (Number.isInteger(value)) return String(value);
  return String(Number(value.toFixed(6)));
}

function normalizeProcessOutput(value: unknown): string | undefined {
  if (value === undefined || value === null) return undefined;
  const text = String(value).trim();
  return text.length ? text : undefined;
}

function getErrorCode(error: unknown): string | undefined {
  if (!error || typeof error !== 'object' || !('code' in error)) return undefined;
  const code = (error as { code?: unknown }).code;
  return typeof code === 'string' ? code : undefined;
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (error && typeof error === 'object' && 'message' in error) {
    const message = (error as { message?: unknown }).message;
    if (typeof message === 'string') return message;
  }
  return String(error);
}

function stableHash(value: unknown): string {
  const text = stableStringify(value);
  let hash = 2166136261;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return `fnv1a32:${(hash >>> 0).toString(16).padStart(8, '0')}`;
}

function stableStringify(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stableStringify(record[key])}`)
      .join(',')}}`;
  }
  return JSON.stringify(value);
}
