#!/usr/bin/env node
/**
 * D.040 Sovereign Trait Canary
 *
 * Verifies that all 6 D.040 sovereign traits are:
 *   - Present as source files
 *   - Exported from traits/index.ts
 *   - Have corresponding test files
 *   - Integrated into ItemManifest.ts (5 applicable configs)
 *   - Documented in docs/sovereign-traits.md
 *   - Demonstrated by compose templates
 *
 * Run via: node scripts/__tests__/d040-sovereign-trait-canary.test.mjs
 */

import { readFileSync, existsSync } from "node:fs";
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

function assertOk(value, name) {
  testsRun += 1;
  if (value) {
    pass(name);
  } else {
    fail(name);
  }
}

function read(relPath) {
  return readFileSync(join(REPO_ROOT, ...relPath.split("/")), "utf8");
}

function fileExists(relPath) {
  return existsSync(join(REPO_ROOT, ...relPath.split("/")));
}

// ═══════════════════════════════════════════════════════════════════════════════
// TRAIT DEFINITIONS
// ═══════════════════════════════════════════════════════════════════════════════

const TRAITS = [
  {
    name: "VerbalFingerprint",
    file: "packages/core/src/traits/VerbalFingerprintTrait.ts",
    test: "packages/core/src/traits/__tests__/VerbalFingerprintTrait.test.ts",
    configType: "VerbalFingerprintConfig",
    inItemManifest: true,
  },
  {
    name: "AutonomousAgenda",
    file: "packages/core/src/traits/AutonomousAgendaTrait.ts",
    test: "packages/core/src/traits/__tests__/AutonomousAgendaTrait.test.ts",
    configType: "AutonomousAgendaConfig",
    inItemManifest: true,
  },
  {
    name: "ReputationLedger",
    file: "packages/core/src/traits/ReputationLedgerTrait.ts",
    test: "packages/core/src/traits/__tests__/ReputationLedgerTrait.test.ts",
    configType: "ReputationLedgerConfig",
    inItemManifest: true,
  },
  {
    name: "VocabularyRegister",
    file: "packages/core/src/traits/VocabularyRegisterTrait.ts",
    test: "packages/core/src/traits/__tests__/VocabularyRegisterTrait.test.ts",
    configType: "VocabularyRegisterConfig",
    inItemManifest: true,
  },
  {
    name: "SpeechAwareEncounter",
    file: "packages/core/src/traits/SpeechAwareEncounterTrait.ts",
    test: "packages/core/src/traits/__tests__/SpeechAwareEncounterTrait.test.ts",
    configType: "SpeechAwareEncounterConfig",
    inItemManifest: true,
  },
  {
    name: "AvatarIntent",
    file: "packages/core/src/traits/AvatarIntentTrait.ts",
    test: "packages/core/src/traits/__tests__/AvatarIntentTrait.test.ts",
    configType: "AvatarIntentConfig",
    inItemManifest: false, // avatar-specific, not applicable to items
  },
];

// ═══════════════════════════════════════════════════════════════════════════════
// GROUP 1: Source files exist and export config type
// ═══════════════════════════════════════════════════════════════════════════════

console.log("\n=== Group 1: Trait source files ===\n");

for (const trait of TRAITS) {
  assertOk(fileExists(trait.file), `${trait.name} source file exists`);
  if (fileExists(trait.file)) {
    const source = read(trait.file);
    assertOk(
      source.includes(`export interface ${trait.configType}`) ||
        source.includes(`export type ${trait.configType}`),
      `${trait.name} exports ${trait.configType}`
    );
    assertOk(
      source.includes("export ") && source.includes("Handler"),
      `${trait.name} exports a handler`
    );
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// GROUP 2: Test files exist
// ═══════════════════════════════════════════════════════════════════════════════

console.log("\n=== Group 2: Trait test files ===\n");

for (const trait of TRAITS) {
  assertOk(fileExists(trait.test), `${trait.name} test file exists`);
}

// ═══════════════════════════════════════════════════════════════════════════════
// GROUP 3: traits/index.ts exports all 6 traits
// ═══════════════════════════════════════════════════════════════════════════════

console.log("\n=== Group 3: traits/index.ts exports ===\n");

const traitsIndex = read("packages/core/src/traits/index.ts");
for (const trait of TRAITS) {
  assertOk(
    traitsIndex.includes(`from './${trait.name}Trait'`) ||
      traitsIndex.includes(`from "./${trait.name}Trait"`),
    `traits/index.ts exports ${trait.name}Trait`
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// GROUP 4: ItemManifest.ts imports all 5 item-applicable configs
// ═══════════════════════════════════════════════════════════════════════════════

console.log("\n=== Group 4: ItemManifest.ts integration ===\n");

const itemManifest = read("packages/core/src/hololand/ItemManifest.ts");
for (const trait of TRAITS) {
  if (trait.inItemManifest) {
    assertOk(
      itemManifest.includes(trait.configType),
      `ItemManifest.ts imports ${trait.configType}`
    );
  } else {
    assertOk(
      !itemManifest.includes(trait.configType),
      `ItemManifest.ts correctly omits ${trait.configType} (avatar-only)`
    );
  }
}

// Verify factory uses the configs
assertOk(
  itemManifest.includes("verbalFingerprint") && itemManifest.includes("VerbalFingerprintConfig"),
  "ItemManifest factory wires verbalFingerprint"
);
assertOk(
  itemManifest.includes("autonomousAgenda") && itemManifest.includes("AutonomousAgendaConfig"),
  "ItemManifest factory wires autonomousAgenda"
);
assertOk(
  itemManifest.includes("reputationLedger") && itemManifest.includes("ReputationLedgerConfig"),
  "ItemManifest factory wires reputationLedger"
);
assertOk(
  itemManifest.includes("vocabularyRegister") && itemManifest.includes("VocabularyRegisterConfig"),
  "ItemManifest factory wires vocabularyRegister"
);
assertOk(
  itemManifest.includes("speechAwareEncounter") && itemManifest.includes("SpeechAwareEncounterConfig"),
  "ItemManifest factory wires speechAwareEncounter"
);

// ═══════════════════════════════════════════════════════════════════════════════
// GROUP 5: Documentation exists and has expected structure
// ═══════════════════════════════════════════════════════════════════════════════

console.log("\n=== Group 5: Documentation ===\n");

assertOk(fileExists("docs/sovereign-traits.md"), "docs/sovereign-traits.md exists");
if (fileExists("docs/sovereign-traits.md")) {
  const doc = read("docs/sovereign-traits.md");
  assertOk(doc.includes("# Sovereign Traits Developer Guide"), "doc has title");
  assertOk(doc.includes("@verbalFingerprint"), "doc covers @verbalFingerprint");
  assertOk(doc.includes("@autonomousAgenda"), "doc covers @autonomousAgenda");
  assertOk(doc.includes("@reputationLedger"), "doc covers @reputationLedger");
  assertOk(doc.includes("@vocabularyRegister"), "doc covers @vocabularyRegister");
  assertOk(doc.includes("@speechAwareEncounter"), "doc covers @speechAwareEncounter");
  assertOk(doc.includes("@avatarIntent"), "doc covers @avatarIntent");
  assertOk(doc.includes("ItemManifest.ts"), "doc references ItemManifest.ts");
  assertOk(doc.includes("CI Verification"), "doc has CI verification section");
}

// ═══════════════════════════════════════════════════════════════════════════════
// GROUP 6: Compose templates exist and are structurally valid
// ═══════════════════════════════════════════════════════════════════════════════

console.log("\n=== Group 6: Compose templates ===\n");

const TEMPLATES = [
  "examples/templates/d040-sovereign-npc.holo",
  "examples/templates/d040-sovereign-item.holo",
];

for (const tpl of TEMPLATES) {
  assertOk(fileExists(tpl), `${tpl} exists`);
  if (fileExists(tpl)) {
    const source = read(tpl);
    // Basic structural checks: balanced braces, no unclosed block comments
    const openBrace = (source.match(/\{/g) || []).length;
    const closeBrace = (source.match(/\}/g) || []).length;
    assertOk(openBrace === closeBrace, `${tpl} has balanced braces (${openBrace} vs ${closeBrace})`);
    const openComment = (source.match(/\/\*/g) || []).length;
    const closeComment = (source.match(/\*\//g) || []).length;
    assertOk(openComment === closeComment, `${tpl} has balanced block comments`);
    assertOk(source.includes("@verbalFingerprint"), `${tpl} uses @verbalFingerprint`);
    assertOk(source.includes("@autonomousAgenda"), `${tpl} uses @autonomousAgenda`);
    assertOk(source.includes("@reputationLedger"), `${tpl} uses @reputationLedger`);
    assertOk(source.includes("@vocabularyRegister"), `${tpl} uses @vocabularyRegister`);
    assertOk(source.includes("D.040"), `${tpl} references D.040`);
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// SUMMARY
// ═══════════════════════════════════════════════════════════════════════════════

console.log("\n" + "=".repeat(70));
if (testsFailed > 0) {
  console.error(`D.040 SOVEREIGN TRAIT CANARY FAILED: ${testsFailed}/${testsRun} checks failed`);
  process.exit(1);
}
console.log(`D.040 SOVEREIGN TRAIT CANARY PASSED: ${testsRun}/${testsRun} checks passed`);
process.exit(0);
