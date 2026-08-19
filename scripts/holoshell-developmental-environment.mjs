#!/usr/bin/env node
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import crypto from 'node:crypto';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const REPO_ROOT = path.resolve(path.dirname(__filename), '..');
const SCHEMA_VERSION = 'hololand.holoshell.developmental-environment.v0.1.0';
const DEFAULT_OUTPUT = path.join('.tmp', 'holoshell', 'developmental-environment.json');
const DEFAULT_JS_OUTPUT = path.join('.tmp', 'holoshell', 'developmental-environment.js');
const RESEARCH_REF = 'ai-ecosystem/research/2026-05-14_ui-ux-developmental-environment.md';
const RESEARCH_LOCAL_PATH = path.join(os.homedir(), '.ai-ecosystem', 'research', '2026-05-14_ui-ux-developmental-environment.md');
const SOURCE_REF = 'apps/holoshell/source/holoshell-developmental-environment.hsplus';
const DOC_REF = 'apps/holoshell/docs/DEVELOPMENTAL_ENVIRONMENT.md';
const SCRIPT_REF = 'scripts/holoshell-developmental-environment.mjs';

const SPINE = [
  'substrate',
  'vocabulary',
  'composition',
  'two_observer_rendering',
  'honesty',
  'signal_presence',
];

const THREADS = [
  'HoloShell Option C/D UI substrate',
  'Studio rethink Phase 6',
];

const TASKS = [
  {
    id: 'task_1778802617893_o5mp',
    title: 'engineer the mass-function',
    status: 'filed_unclaimed',
    ruling: 'mass-function is derived, not authored',
    diamondRefs: ['W.GOLD.001', 'Pillar 1', 'Pillar 2'],
  },
  {
    id: 'task_1778802617893_zppq',
    title: 'engineer the physics-to-animation mapping-function',
    status: 'filed_unclaimed',
    ruling: 'mapping-function is a pure function of physics state',
    diamondRefs: ['W.GOLD.001', 'W.GOLD.189', 'Pillar 8'],
  },
  {
    id: 'task_1778802907913_5ph8',
    title: 'fix /room skill verification-block bug',
    status: 'filed_unclaimed',
    ruling: 'tooling hygiene surfaced while filing substrate work',
    diamondRefs: [],
  },
];

function parseArgs(argv) {
  const args = {
    output: DEFAULT_OUTPUT,
    jsOutput: DEFAULT_JS_OUTPUT,
    json: false,
    selfTest: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--output') args.output = argv[++index] || DEFAULT_OUTPUT;
    else if (arg === '--js-output') args.jsOutput = argv[++index] || DEFAULT_JS_OUTPUT;
    else if (arg === '--json') args.json = true;
    else if (arg === '--self-test') args.selfTest = true;
    else if (arg === '--help' || arg === '-h') {
      printHelp();
      process.exit(0);
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }
  return args;
}

function printHelp() {
  console.log(`HoloShell developmental environment receipt

Usage:
  node scripts/holoshell-developmental-environment.mjs [options]

Options:
  --json              Print JSON.
  --self-test         Run fixture assertions.
  --output <path>     JSON output. Defaults to ${DEFAULT_OUTPUT}
  --js-output <path>  Browser bootstrap output. Defaults to ${DEFAULT_JS_OUTPUT}
  -h, --help          Show this help.
`);
}

function resolveRepoPath(filePath) {
  return path.isAbsolute(filePath) ? filePath : path.resolve(REPO_ROOT, filePath);
}

function hashValue(value) {
  return crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

function shortHash(value, length = 12) {
  return hashValue(value).slice(0, length);
}

function readOptional(filePath, options = {}) {
  const resolved = options.absolute ? filePath : resolveRepoPath(filePath);
  if (!existsSync(resolved)) return { exists: false, text: '', sha256: '' };
  const text = readFileSync(resolved, 'utf8');
  return { exists: true, text, sha256: hashValue(text) };
}

function writeJson(filePath, value) {
  const resolved = resolveRepoPath(filePath);
  mkdirSync(path.dirname(resolved), { recursive: true });
  writeFileSync(resolved, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
  return resolved;
}

function writeBrowserBootstrap(filePath, receipt) {
  const resolved = resolveRepoPath(filePath);
  mkdirSync(path.dirname(resolved), { recursive: true });
  const payload = JSON.stringify(receipt, null, 2).replace(/<\/script/gi, '<\\/script');
  writeFileSync(resolved, `window.HOLOSHELL_DEVELOPMENTAL_ENVIRONMENT = ${payload};\n`, 'utf8');
  return resolved;
}

function buildReceipt() {
  const research = readOptional(RESEARCH_LOCAL_PATH, { absolute: true });
  const generatedAt = new Date().toISOString();
  const thesis = {
    reframe: 'wireframe_to_simulation_to_geometrics',
    telos: 'developmental_environment',
    brittneyRole: 'assistant_parent_presence',
    riskiestAssumption: 'graduation_to_real_agency_must_actually_happen',
    massFunctionRuling: 'derived_not_authored',
    mappingFunctionRuling: 'pure_function_of_physics_state',
    mappingHonestyPrinciple: 'animation must be explainable from physics state rather than cosmetic preference',
  };
  const receiptId = `dev-env-${Date.now().toString(36)}-${shortHash(thesis)}`;

  return {
    schemaVersion: SCHEMA_VERSION,
    generatedAt,
    receiptId,
    title: 'HoloShell Developmental Environment',
    sourceAnchors: {
      research: RESEARCH_REF,
      researchStore: 'user_home/.ai-ecosystem/research',
      source: SOURCE_REF,
      doc: DOC_REF,
      adapter: SCRIPT_REF,
    },
    host: {
      platform: process.platform,
      arch: process.arch,
      release: os.release(),
      hostname: os.hostname(),
    },
    thesis,
    spine: SPINE.map((id, index) => ({
      id,
      order: index + 1,
      status: id === 'honesty' || id === 'two_observer_rendering' ? 'engineering_next' : 'substrate_defined',
    })),
    functions: {
      massFunction: {
        status: 'board_task_open',
        authoredByUser: false,
        derivation: 'Diamond layer plus physics substrate',
        boardTaskId: TASKS[0].id,
      },
      physicsAnimationMapping: {
        status: 'board_task_open',
        purity: 'pure_function_of_physics_state',
        honestyPrinciple: 'visual motion must not lie about underlying state',
        boardTaskId: TASKS[1].id,
      },
    },
    threads: THREADS.map((thread) => ({ thread, status: 'open_next_move' })),
    boardTasks: TASKS,
    researchReceipt: {
      path: RESEARCH_REF,
      presentInAiEcosystem: research.exists,
      sha256: research.sha256,
      note: research.exists
        ? 'Research receipt found in the ai-ecosystem research store.'
        : 'Research receipt was reported by the user but is not present in the ai-ecosystem research store.',
    },
    summary: {
      status: 'ready',
      spineLayerCount: SPINE.length,
      boardTaskCount: TASKS.length,
      openEngineeringTaskCount: TASKS.filter((task) => task.status === 'filed_unclaimed').length,
      researchPresent: research.exists,
      massFunctionSettled: true,
      mappingFunctionSettled: true,
      honestyPrinciple: 'physics_state_drives_animation',
      nextMove: 'engineer_mass_function_then_physics_animation_mapping',
    },
  };
}

function assertSelfTest(receipt) {
  const failures = [];
  if (receipt.schemaVersion !== SCHEMA_VERSION) failures.push('schemaVersion mismatch');
  if (receipt.summary.status !== 'ready') failures.push('expected ready status');
  if (!receipt.summary.massFunctionSettled) failures.push('mass-function ruling should be settled');
  if (!receipt.summary.mappingFunctionSettled) failures.push('mapping-function ruling should be settled');
  if (receipt.functions.physicsAnimationMapping.purity !== 'pure_function_of_physics_state') failures.push('mapping function must be pure');
  if (receipt.spine.length !== 6) failures.push('expected six spine layers');
  if (receipt.boardTasks.length !== 3) failures.push('expected three board tasks');
  if (failures.length) throw new Error(`Self-test failed:\n- ${failures.join('\n- ')}`);
}

try {
  const args = parseArgs(process.argv.slice(2));
  const receipt = buildReceipt();
  if (args.selfTest) assertSelfTest(receipt);
  const output = writeJson(args.output, receipt);
  const jsOutput = writeBrowserBootstrap(args.jsOutput, receipt);
  if (args.json) {
    console.log(JSON.stringify(receipt, null, 2));
  } else if (args.selfTest) {
    console.log('HoloShell developmental environment self-test passed.');
  } else {
    console.log(`HoloShell developmental environment: ${output}`);
    console.log(`Browser bootstrap: ${jsOutput}`);
    console.log(`Status: ${receipt.summary.status}`);
    console.log(`Next: ${receipt.summary.nextMove}`);
  }
} catch (error) {
  console.error(`holoshell-developmental-environment failed: ${error.message}`);
  process.exit(1);
}
