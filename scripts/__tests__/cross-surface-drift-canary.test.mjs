#!/usr/bin/env node
/**
 * Cross-Surface Substrate Drift Canary
 *
 * Detects when critical HoloLand/HoloScript substrate claims drift
 * between their canonical definition surfaces:
 *   - Framework types / validators / type guards (canonical source)
 *   - MCP tool schemas (runtime surface)
 *   - Receipt exports (package boundary)
 *   - Package manifests (npm boundary)
 *
 * Run via: node scripts/__tests__/cross-surface-drift-canary.test.mjs
 */

import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, "..", "..");

let testsRun = 0;
let testsFailed = 0;

function fail(msg) {
  testsFailed += 1;
  console.error(`  FAIL: ${msg}`);
}

function pass(msg) {
  console.log(`  PASS: ${msg}`);
}

function assertEq(actual, expected, name) {
  testsRun += 1;
  if (actual === expected) {
    pass(name);
  } else {
    fail(`${name}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}

function assertOk(value, name) {
  testsRun += 1;
  if (value) {
    pass(name);
  } else {
    fail(name);
  }
}

function assertSetEq(actualSet, expectedSet, name) {
  testsRun += 1;
  const missing = [...expectedSet].filter((x) => !actualSet.has(x));
  const extra = [...actualSet].filter((x) => !expectedSet.has(x));
  if (missing.length === 0 && extra.length === 0) {
    pass(name);
  } else {
    const parts = [];
    if (missing.length) parts.push(`missing: [${missing.join(", ")}]`);
    if (extra.length) parts.push(`extra: [${extra.join(", ")}]`);
    fail(`${name}: ${parts.join("; ")}`);
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function read(relPath) {
  return readFileSync(join(REPO_ROOT, ...relPath.split("/")), "utf8");
}

function extractConstArray(source, name) {
  const regex = new RegExp(`(?:export\\s+)?const\\s+${name}\\s*=\\s*\\[([^\\]]*)\\]`);
  const match = source.match(regex);
  if (!match) return [];
  return match[1]
    .split(",")
    .map((s) => s.trim().replace(/['"]/g, ""))
    .filter((s) => s.length > 0);
}

function extractEnumMembers(source, typeName) {
  // type X = 'a' | 'b' | 'c';
  const regex = new RegExp(`export\\s+type\\s+${typeName}\\s*=([^;]+);`);
  const match = source.match(regex);
  if (!match) return [];
  return match[1]
    .split("|")
    .map((s) => s.trim().replace(/['"]/g, ""))
    .filter((s) => s.length > 0);
}

function extractFunctionNames(source, prefix) {
  const regex = new RegExp(`export\\s+function\\s+(${prefix}\\w+)`, "g");
  const names = [];
  let m;
  while ((m = regex.exec(source)) !== null) {
    names.push(m[1]);
  }
  return names;
}

function extractInterfaceNames(source) {
  const regex = /export\s+interface\s+(\w+)/g;
  const names = [];
  let m;
  while ((m = regex.exec(source)) !== null) {
    names.push(m[1]);
  }
  return names;
}

// ─── Source Files ─────────────────────────────────────────────────────────────

const twinEarthSource = read("packages/framework/src/board/twin-earth-substrate.ts");
const hololandReceiptsSource = read("packages/framework/src/board/hololand-receipts.ts");
const robotAiMcpSource = read("packages/mcp-server/src/robot-ai-mcp-tools.ts");
const hololandMcpSource = read("packages/mcp-server/src/hololand-mcp-tools.ts");
const frameworkIndexSource = read("packages/framework/src/index.ts");
const frameworkPkg = JSON.parse(read("packages/framework/package.json"));

// ═══════════════════════════════════════════════════════════════════════════════
// DRIFT CHECKS
// ═══════════════════════════════════════════════════════════════════════════════

console.log("\n=== Group 1: Receipt constant ↔ type guard drift ===\n");

// 1.1 HARDWARE_RECEIPT_KINDS ↔ isSupportedHardwareReceiptKind
{
  const kinds = extractConstArray(hololandReceiptsSource, "HARDWARE_RECEIPT_KINDS");
  const guardBody = hololandReceiptsSource.match(
    /function isSupportedHardwareReceiptKind[\s\S]*?\{[\s\S]*?\n\}/)?.[0] || "";
  const guardArray = (guardBody.match(/HARDWARE_RECEIPT_KINDS/) || []).length;
  assertOk(kinds.length > 0, "HARDWARE_RECEIPT_KINDS is non-empty");
  assertOk(guardArray > 0, "isSupportedHardwareReceiptKind references HARDWARE_RECEIPT_KINDS");
}

// 1.2 AGENT_ACTION_KINDS ↔ isSupportedAgentActionKind
{
  const kinds = extractConstArray(hololandReceiptsSource, "AGENT_ACTION_KINDS");
  const guardBody = hololandReceiptsSource.match(
    /function isSupportedAgentActionKind[\s\S]*?\{[\s\S]*?\n\}/)?.[0] || "";
  assertOk(kinds.length > 0, "AGENT_ACTION_KINDS is non-empty");
  assertOk(guardBody.includes("AGENT_ACTION_KINDS"), "isSupportedAgentActionKind references AGENT_ACTION_KINDS");
}

// 1.3 QUALCOMM_NIR_RUNTIME_TARGETS ↔ isSupportedQualcommNIRRuntimeTarget
{
  const targets = extractConstArray(hololandReceiptsSource, "QUALCOMM_NIR_RUNTIME_TARGETS");
  const guardBody = hololandReceiptsSource.match(
    /function isSupportedQualcommNIRRuntimeTarget[\s\S]*?\{[\s\S]*?\n\}/)?.[0] || "";
  assertOk(targets.length > 0, "QUALCOMM_NIR_RUNTIME_TARGETS is non-empty");
  assertOk(guardBody.includes("QUALCOMM_NIR_RUNTIME_TARGETS"), "isSupportedQualcommNIRRuntimeTarget references QUALCOMM_NIR_RUNTIME_TARGETS");
}

// 1.4 HARDWARE_COMPILATION_TARGET_KINDS ↔ isSupportedHardwareCompilationTarget
{
  const targets = extractConstArray(hololandReceiptsSource, "HARDWARE_COMPILATION_TARGET_KINDS");
  const guardBody = hololandReceiptsSource.match(
    /function isSupportedHardwareCompilationTarget[\s\S]*?\{[\s\S]*?\n\}/)?.[0] || "";
  assertOk(targets.length > 0, "HARDWARE_COMPILATION_TARGET_KINDS is non-empty");
  assertOk(guardBody.includes("HARDWARE_COMPILATION_TARGET_KINDS"), "isSupportedHardwareCompilationTarget references HARDWARE_COMPILATION_TARGET_KINDS");
}

// 1.5 TwinEarthReceiptKind ↔ isSupportedTwinEarthReceiptKind
{
  const kinds = extractEnumMembers(twinEarthSource, "TwinEarthReceiptKind");
  const guardBody = twinEarthSource.match(
    /function isSupportedTwinEarthReceiptKind[\s\S]*?\{[\s\S]*?\n\}/)?.[0] || "";
  assertOk(kinds.length > 0, "TwinEarthReceiptKind has members");
  assertOk(guardBody.includes("'action'"), "isSupportedTwinEarthReceiptKind covers 'action'");
  assertOk(guardBody.includes("'validation'"), "isSupportedTwinEarthReceiptKind covers 'validation'");
}

// 1.6 TwinEarthReceiptStatus ↔ isSupportedTwinEarthReceiptStatus
{
  const statuses = extractEnumMembers(twinEarthSource, "TwinEarthReceiptStatus");
  const guardBody = twinEarthSource.match(
    /function isSupportedTwinEarthReceiptStatus[\s\S]*?\{[\s\S]*?\n\}/)?.[0] || "";
  assertOk(statuses.length > 0, "TwinEarthReceiptStatus has members");
  for (const s of statuses) {
    assertOk(guardBody.includes(`'${s}'`), `isSupportedTwinEarthReceiptStatus covers '${s}'`);
  }
}

// 1.7 TwinEarthRole ↔ isSupportedTwinEarthRole
{
  const roles = extractEnumMembers(twinEarthSource, "TwinEarthRole");
  const guardBody = twinEarthSource.match(
    /function isSupportedTwinEarthRole[\s\S]*?\{[\s\S]*?\n\}/)?.[0] || "";
  assertOk(roles.length > 0, "TwinEarthRole has members");
  for (const r of roles) {
    assertOk(guardBody.includes(`'${r}'`), `isSupportedTwinEarthRole covers '${r}'`);
  }
}

// 1.8 ParticipationMode ↔ isSupportedParticipationMode
{
  const modes = extractEnumMembers(twinEarthSource, "ParticipationMode");
  const guardBody = twinEarthSource.match(
    /function isSupportedParticipationMode[\s\S]*?\{[\s\S]*?\n\}/)?.[0] || "";
  assertOk(modes.length > 0, "ParticipationMode has members");
  for (const m of modes) {
    assertOk(guardBody.includes(`'${m}'`), `isSupportedParticipationMode covers '${m}'`);
  }
}

// 1.9 TwinEarthKind ↔ isSupportedTwinEarthKind
{
  const kinds = extractEnumMembers(twinEarthSource, "TwinEarthKind");
  const guardBody = twinEarthSource.match(
    /function isSupportedTwinEarthKind[\s\S]*?\{[\s\S]*?\n\}/)?.[0] || "";
  assertOk(kinds.length > 0, "TwinEarthKind has members");
  for (const k of kinds) {
    assertOk(guardBody.includes(`'${k}'`), `isSupportedTwinEarthKind covers '${k}'`);
  }
}

console.log("\n=== Group 2: Receipt type ↔ validator / clone drift ===\n");

// 2.1 Every exported receipt interface has a validator
{
  const interfaces = extractInterfaceNames(hololandReceiptsSource);
  const validators = extractFunctionNames(hololandReceiptsSource, "validate");
  const clones = extractFunctionNames(hololandReceiptsSource, "clone");

  const receiptInterfaces = interfaces.filter(
    (name) =>
      name.endsWith("Receipt") ||
      name === "HardwareReceipt" ||
      name === "ReplayInput" ||
      name === "ReplayOutcome"
  );

  for (const iface of receiptInterfaces) {
    const expectedValidator = `validate${iface}`;
    const expectedClone = `clone${iface}`;
    assertOk(
      validators.includes(expectedValidator),
      `${iface} has validator ${expectedValidator}`
    );
    assertOk(
      clones.includes(expectedClone),
      `${iface} has clone ${expectedClone}`
    );
  }
}

// 2.2 Twin Earth substrate interfaces have validators
{
  const twinInterfaces = extractInterfaceNames(twinEarthSource);
  const twinValidators = extractFunctionNames(twinEarthSource, "validate");
  const twinClones = extractFunctionNames(twinEarthSource, "clone");

  const coreInterfaces = [
    "TwinEarthIdentity",
    "PermissionGrant",
    "SafetyEnvelope",
    "TwinEarthReceipt",
    "ModeTransitionReceipt",
  ];

  for (const iface of coreInterfaces) {
    const expectedValidator = `validate${iface}`;
    const expectedClone = `clone${iface}`;
    assertOk(
      twinValidators.includes(expectedValidator),
      `TwinEarth ${iface} has validator ${expectedValidator}`
    );
    assertOk(
      twinClones.includes(expectedClone),
      `TwinEarth ${iface} has clone ${expectedClone}`
    );
  }
}

console.log("\n=== Group 3: TwinEarthAction ↔ MCP tool schema drift ===\n");

// 3.1 TwinEarthAction values are referenced in MCP tools
{
  const actions = extractEnumMembers(twinEarthSource, "TwinEarthAction");
  assertOk(actions.length > 0, "TwinEarthAction has members");

  // robot:move, robot:task:execute, ai:inference, ai:plan, ai:invoke must appear in MCP
  const robotAiRefs = ["robot:move", "robot:task:execute", "ai:inference", "ai:plan", "ai:invoke"];
  for (const action of robotAiRefs) {
    assertOk(
      actions.includes(action),
      `TwinEarthAction includes ${action}`
    );
  }
}

// 3.2 Robot actuation command enum matches substrate actions
{
  // twin_earth_robot_actuate enum: move, sense, grip, release, halt, report
  const mcpEnumMatch = robotAiMcpSource.match(
    /twin_earth_robot_actuate[\s\S]{0,500}enum:\s*\[([^\]]*)\]/
  );
  if (mcpEnumMatch) {
    const mcpCommands = mcpEnumMatch[1]
      .split(",")
      .map((s) => s.trim().replace(/['"]/g, ""))
      .filter((s) => s.length > 0);
    // MCP uses "move", "sense", etc. which map to robot:move, robot:sense in TwinEarthAction
    const expectedCommands = ["move", "sense", "grip", "release", "halt", "report"];
    assertSetEq(new Set(mcpCommands), new Set(expectedCommands), "MCP robot actuation commands match substrate actions");
  } else {
    fail("Could not extract robot actuation enum from MCP source");
  }
}

// 3.3 twin_earth_capture_receipt status enum matches TwinEarthReceiptStatus
{
  const substrateStatuses = extractEnumMembers(twinEarthSource, "TwinEarthReceiptStatus");
  const mcpStatusMatch = robotAiMcpSource.match(
    /twin_earth_capture_receipt[\s\S]{0,2000}enum:\s*\[([^\]]*)\]/
  );
  if (mcpStatusMatch) {
    const mcpStatuses = mcpStatusMatch[1]
      .split(",")
      .map((s) => s.trim().replace(/['"]/g, ""))
      .filter((s) => s.length > 0);
    assertSetEq(
      new Set(mcpStatuses),
      new Set(substrateStatuses),
      "MCP capture_receipt status enum matches TwinEarthReceiptStatus"
    );
  } else {
    fail("Could not extract capture_receipt status enum from MCP source");
  }
}

console.log("\n=== Group 4: Security boundary drift (evaluateActuation) ===\n");

// 4.1 evaluateActuation is called in robot-ai-mcp-tools.ts
{
  assertOk(
    robotAiMcpSource.includes("evaluateActuation"),
    "robot-ai-mcp-tools.ts calls evaluateActuation"
  );
}

// 4.2 evaluateActuation checks identity first
{
  const evalBody = twinEarthSource.match(
    /function evaluateActuation[\s\S]*?\n\}/
  )?.[0] || "";
  const identityCheckIdx = evalBody.indexOf("validateTwinEarthIdentity");
  const envelopeCheckIdx = evalBody.indexOf("substrateEnforced");
  const grantCheckIdx = evalBody.indexOf("validatePermissionGrant");
  assertOk(identityCheckIdx > 0, "evaluateActuation checks identity");
  assertOk(envelopeCheckIdx > 0, "evaluateActuation checks envelope");
  assertOk(grantCheckIdx > 0, "evaluateActuation checks grant");
  assertOk(
    identityCheckIdx < envelopeCheckIdx,
    "evaluateActuation: identity check precedes envelope check"
  );
  assertOk(
    envelopeCheckIdx < grantCheckIdx,
    "evaluateActuation: envelope check precedes grant check"
  );
}

// 4.3 MCP handler maps robot commands to TwinEarthAction shape
{
  assertOk(
    robotAiMcpSource.includes("robot:"),
    "robot-ai-mcp-tools.ts constructs robot: prefixed actions"
  );
}

console.log("\n=== Group 5: Package export drift ===\n");

// 5.1 @holoscript/framework package.json exports all board modules
{
  const exports = frameworkPkg.exports || {};
  assertOk(exports["."], "framework package has root export");
  // Board symbols are re-exported from the root barrel, not a separate ./board entry
  assertOk(
    frameworkIndexSource.includes("from './board'"),
    "framework index.ts re-exports from ./board"
  );
}

// 5.2 Framework index.ts re-exports all Twin Earth substrate symbols
{
  const expectedExports = [
    "ParticipationMode",
    "TwinEarthRole",
    "TwinEarthKind",
    "TwinEarthIdentity",
    "TwinEarthAction",
    "PermissionGrant",
    "SafetyEnvelope",
    "TwinEarthReceiptKind",
    "TwinEarthReceiptStatus",
    "TwinEarthReceipt",
    "ActuationResult",
    "evaluateActuation",
    "validateTwinEarthIdentity",
    "validatePermissionGrant",
    "validateSafetyEnvelope",
    "validateTwinEarthReceipt",
    "validateModeTransitionReceipt",
    "isSupportedTwinEarthRole",
    "isSupportedParticipationMode",
    "isSupportedTwinEarthKind",
    "isSupportedTwinEarthReceiptKind",
    "isSupportedTwinEarthReceiptStatus",
    "cloneTwinEarthIdentity",
    "clonePermissionGrant",
    "cloneSafetyEnvelope",
    "cloneTwinEarthReceipt",
  ];
  for (const sym of expectedExports) {
    assertOk(
      frameworkIndexSource.includes(sym),
      `framework index.ts re-exports ${sym}`
    );
  }
}

console.log("\n=== Group 6: Receipt policy drift ===\n");

// 6.1 Package provenance: unverified signer cannot be admitted
{
  const validatorBody = hololandReceiptsSource.match(
    /function validatePackageProvenanceReceipt[\s\S]*?\n\}/
  )?.[0] || "";
  assertOk(
    validatorBody.includes("unverified") && validatorBody.includes("admitted"),
    "PackageProvenanceReceipt validator blocks unverified+admitted"
  );
}

// 6.2 Trust tier constants match isSupportedTrustTier
{
  const tiers = extractConstArray(hololandReceiptsSource, "PACKAGE_PROVENANCE_TRUST_TIERS");
  const guardBody = hololandReceiptsSource.match(
    /function isSupportedTrustTier[\s\S]*?\{[\s\S]*?\n\}/)?.[0] || "";
  assertOk(tiers.length > 0, "PACKAGE_PROVENANCE_TRUST_TIERS is non-empty");
  assertOk(
    guardBody.includes("PACKAGE_PROVENANCE_TRUST_TIERS"),
    "isSupportedTrustTier references PACKAGE_PROVENANCE_TRUST_TIERS"
  );
}

// 6.3 Admission decision constants match isSupportedAdmissionDecision
{
  const decisions = extractConstArray(hololandReceiptsSource, "PACKAGE_PROVENANCE_ADMISSION_DECISIONS");
  const guardBody = hololandReceiptsSource.match(
    /function isSupportedAdmissionDecision[\s\S]*?\{[\s\S]*?\n\}/)?.[0] || "";
  assertOk(decisions.length > 0, "PACKAGE_PROVENANCE_ADMISSION_DECISIONS is non-empty");
  assertOk(
    guardBody.includes("PACKAGE_PROVENANCE_ADMISSION_DECISIONS"),
    "isSupportedAdmissionDecision references PACKAGE_PROVENANCE_ADMISSION_DECISIONS"
  );
}

console.log("\n=== Group 7: Cross-hardware compilation receipt drift ===\n");

// 7.1 CrossHardwareCompilationReceipt has validator
{
  assertOk(
    hololandReceiptsSource.includes("function validateCrossHardwareCompilationReceipt"),
    "CrossHardwareCompilationReceipt has a validator"
  );
}

// 7.2 CrossHardwareCompilationReceipt references isSupportedHardwareCompilationTarget
{
  const validatorBody = hololandReceiptsSource.match(
    /function validateCrossHardwareCompilationReceipt[\s\S]*?\n\}/
  )?.[0] || "";
  assertOk(
    validatorBody.includes("isSupportedHardwareCompilationTarget"),
    "validateCrossHardwareCompilationReceipt uses isSupportedHardwareCompilationTarget"
  );
}

// 7.3 HardwareCompilationConstraints quantization enum is valid
{
  const constraintMatch = hololandReceiptsSource.match(
    /quantization\?:\s*('[^']+')\s*\|\s*('[^']+')\s*\|\s*('[^']+')\s*\|\s*('[^']+')\s*\|\s*('[^']+)/
  );
  if (constraintMatch) {
    const modes = constraintMatch.slice(1)
      .map((s) => s.trim().replace(/['"]/g, ""))
      .filter((s) => s.length > 0);
    const expected = ["fp32", "fp16", "int8", "int4", "mixed"];
    assertSetEq(new Set(modes), new Set(expected), "HardwareCompilationConstraints quantization modes match expected");
  } else {
    fail("Could not extract quantization modes");
  }
}

// ─── Summary ──────────────────────────────────────────────────────────────────

console.log("\n" + "=".repeat(70));
if (testsFailed > 0) {
  console.error(`CROSS-SURFACE DRIFT CANARY FAILED: ${testsFailed}/${testsRun} checks failed`);
  process.exit(1);
}
console.log(`CROSS-SURFACE DRIFT CANARY PASSED: ${testsRun}/${testsRun} checks passed`);
process.exit(0);
