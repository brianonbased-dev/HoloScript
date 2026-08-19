#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const REPO_ROOT = path.resolve(path.dirname(__filename), '..');
const HS_CLI = path.resolve(REPO_ROOT, '..', 'HoloScript', 'packages', 'cli', 'dist', 'cli.js');
const SCHEMA = 'hololand.holoshell.uaa2-service-seed-gate.v0.1.0';
const DEFAULT_SOURCE = path.join('apps', 'holoshell', 'source', 'holoshell-uaa2-service-seed-gate.hsplus');
const DEFAULT_SEED = path.join('docs', 'archive', 'HOLOLAND_UAA2_INTEGRATION.md');
const DEFAULT_UAA2_ROOT = path.resolve(REPO_ROOT, '..', 'uaa2-service');
const DEFAULT_OUTPUT_DIR = path.join('.tmp', 'holoshell', 'uaa2-service-seed-gate');

function parseArgs(argv = process.argv.slice(2)) {
  const args = {
    source: DEFAULT_SOURCE,
    seed: DEFAULT_SEED,
    uaa2Root: DEFAULT_UAA2_ROOT,
    outputDir: DEFAULT_OUTPUT_DIR,
    receipt: '',
    wildReceipt: '',
    wildJs: '',
    learning: '',
    json: false,
    help: false,
  };

  const next = (argvRef, indexRef, flag) => {
    const nextIndex = indexRef + 1;
    if (nextIndex >= argvRef.length) throw new Error(`Missing value for ${flag}`);
    return [argvRef[nextIndex], nextIndex];
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--source') [args.source, index] = next(argv, index, arg);
    else if (arg === '--seed') [args.seed, index] = next(argv, index, arg);
    else if (arg === '--uaa2-root') [args.uaa2Root, index] = next(argv, index, arg);
    else if (arg === '--output-dir') [args.outputDir, index] = next(argv, index, arg);
    else if (arg === '--receipt') [args.receipt, index] = next(argv, index, arg);
    else if (arg === '--wild-receipt') [args.wildReceipt, index] = next(argv, index, arg);
    else if (arg === '--wild-js') [args.wildJs, index] = next(argv, index, arg);
    else if (arg === '--learning') [args.learning, index] = next(argv, index, arg);
    else if (arg === '--json') args.json = true;
    else if (arg === '--help' || arg === '-h') args.help = true;
    else throw new Error(`Unknown option: ${arg}`);
  }

  args.source = resolveRepoPath(args.source);
  args.seed = resolveRepoPath(args.seed);
  args.uaa2Root = path.isAbsolute(args.uaa2Root) ? path.normalize(args.uaa2Root) : path.resolve(REPO_ROOT, args.uaa2Root);
  args.outputDir = resolveRepoPath(args.outputDir);
  if (!args.receipt) args.receipt = path.join(args.outputDir, 'receipt.json');
  else args.receipt = resolveRepoPath(args.receipt);
  if (!args.wildReceipt) args.wildReceipt = path.join(args.outputDir, 'wild-holoscript-intake.json');
  else args.wildReceipt = resolveRepoPath(args.wildReceipt);
  if (!args.wildJs) args.wildJs = path.join(args.outputDir, 'wild-holoscript-intake.js');
  else args.wildJs = resolveRepoPath(args.wildJs);
  if (!args.learning) args.learning = path.join(args.outputDir, 'learning-signal.jsonl');
  else args.learning = resolveRepoPath(args.learning);
  return args;
}

function usage() {
  return `Usage: node scripts/holoshell-uaa2-service-seed-gate.mjs [options]

Promotes the archived HoloLand uaa2-service integration seed into a current
source-first gate: review the seed, run the read-only wild HoloScript intake,
validate the HoloScript gate source, and emit a receipt plus learning signal.

Options:
  --source <file>        HoloScript gate source
  --seed <file>          Archived seed markdown
  --uaa2-root <dir>      uaa2-service checkout to scan
  --output-dir <dir>     Evidence directory
  --receipt <file>       Receipt JSON path
  --wild-receipt <file>  Wild intake receipt path
  --wild-js <file>       Wild intake browser bootstrap path
  --learning <file>      JSONL learning signal path
  --json                 Print receipt JSON
  -h, --help             Show this help
`;
}

function resolveRepoPath(filePath) {
  return path.isAbsolute(filePath) ? path.normalize(filePath) : path.resolve(REPO_ROOT, filePath);
}

function relativeToRepo(filePath) {
  return path.relative(REPO_ROOT, filePath).replace(/\\/g, '/');
}

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

function countMatches(text, pattern) {
  return [...String(text).matchAll(pattern)].length;
}

function writeText(filePath, value) {
  mkdirSync(path.dirname(filePath), { recursive: true });
  writeFileSync(filePath, value, 'utf8');
}

function writeJson(filePath, value) {
  writeText(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

function readJsonIfPresent(filePath) {
  if (!existsSync(filePath)) return null;
  return JSON.parse(readFileSync(filePath, 'utf8'));
}

function tail(value, count = 8) {
  return String(value || '').split(/\r?\n/).filter(Boolean).slice(-count);
}

function bracesBalanced(source) {
  let depth = 0;
  for (const char of source) {
    if (char === '{') depth += 1;
    else if (char === '}') depth -= 1;
    if (depth < 0) return false;
  }
  return depth === 0;
}

function structuralValidation(source, sourcePath) {
  const requiredTokens = [
    'composition "HoloShell UAA2 Service Seed Gate"',
    'policy "ArchivedSeedIsNotRuntimePlan"',
    'policy "Uaa2IsReadOnlyCorpusOrContractedProducer"',
    'policy "AdapterBeforeExecution"',
    'policy "PromptBuildMustEmitSourceAndReceipt"',
    'policy "LearningSignalFeedsHoloTuneOnlyAfterValidation"',
    'template "Uaa2ServiceSeedGateReceipt"',
    'action apply_seed_review',
  ];
  const errors = [];
  if (!bracesBalanced(source)) errors.push('curly braces are not balanced');
  for (const token of requiredTokens) {
    if (!source.includes(token)) errors.push(`missing token: ${token}`);
  }
  return {
    tool: 'hololand.uaa2-service-seed-gate.structural-guard',
    file: relativeToRepo(sourcePath),
    status: errors.length ? 'fail' : 'pass',
    requiredTokens,
    errors,
  };
}

function parseWithHoloScriptCli(filePath) {
  if (!existsSync(HS_CLI)) {
    return {
      tool: 'HoloScript CLI parse',
      file: relativeToRepo(filePath),
      status: 'blocked',
      command: `node ${HS_CLI} parse ${filePath}`,
      reason: 'HoloScript CLI dist entry not found',
    };
  }

  const result = spawnSync(process.execPath, [HS_CLI, 'parse', filePath], {
    cwd: path.dirname(HS_CLI),
    encoding: 'utf8',
    windowsHide: true,
    timeout: 60_000,
  });
  return {
    tool: 'HoloScript CLI parse',
    file: relativeToRepo(filePath),
    status: result.status === 0 ? 'pass' : 'fail',
    command: `node ${HS_CLI} parse ${filePath}`,
    exitCode: result.status,
    stdoutTail: tail(result.stdout, 5),
    stderrTail: tail(result.stderr, 5),
  };
}

function runWildIntake(args) {
  const script = resolveRepoPath(path.join('scripts', 'holoshell-wild-holoscript-intake.mjs'));
  const commandArgs = [
    script,
    '--uaa2-root',
    args.uaa2Root,
    '--output',
    args.wildReceipt,
    '--js-output',
    args.wildJs,
  ];
  const result = spawnSync(process.execPath, commandArgs, {
    cwd: REPO_ROOT,
    encoding: 'utf8',
    windowsHide: true,
    timeout: 120_000,
  });
  const receipt = readJsonIfPresent(args.wildReceipt);
  return {
    status: result.status === 0 && receipt ? 'pass' : 'fail',
    command: `node scripts/holoshell-wild-holoscript-intake.mjs --uaa2-root ${args.uaa2Root}`,
    exitCode: result.status,
    stdoutTail: tail(result.stdout),
    stderrTail: tail(result.stderr),
    receipt,
  };
}

function seedReview(seedText, seedPath) {
  const realCapabilitySignals = [
    { id: 'ai_assisted_building', pattern: /AI-assisted building|AI-Powered Building|AI generates HoloScript/i },
    { id: 'agent_services', pattern: /Agent Services|AI agents help users/i },
    { id: 'payment_processing', pattern: /Payment Processing|payments\/process/i },
    { id: 'holoscript_output', pattern: /HoloScript/i },
  ].filter((signal) => signal.pattern.test(seedText)).map((signal) => signal.id);
  const speculativeMarkers = countMatches(seedText, /True Singularity|consciousness|SPECULATIVE|Unknown timeline/gi);
  const apiEndpointMentions = [...new Set([...seedText.matchAll(/\/api\/v1\/[A-Za-z0-9_/:.-]+/g)].map((match) => match[0]))];
  const holoscriptMentions = countMatches(seedText, /HoloScript/g);
  const paymentMentions = countMatches(seedText, /payment|payments|revenue|treasury/gi);

  const errors = [];
  if (!realCapabilitySignals.includes('holoscript_output')) errors.push('seed does not mention HoloScript output');
  if (!realCapabilitySignals.includes('ai_assisted_building')) errors.push('seed does not include the AI-assisted building slice');

  return {
    status: errors.length ? 'fail' : 'reviewed',
    path: relativeToRepo(seedPath),
    sha256: sha256(seedText),
    realCapabilitySignals,
    speculativeMarkers,
    apiEndpointMentions,
    holoscriptMentions,
    paymentMentions,
    retiredRuntimeClaims: [
      'direct HoloLand to uaa2-service API dependency',
      'payment split implementation as current HoloLand runtime scope',
      'true singularity operations as product requirement',
    ],
    promotedAs: [
      'agent prompt to HoloScript source contract',
      'read-only wild HoloScript compatibility corpus',
      'adapter-required promotion map',
      'learning-signal candidate after validation',
    ],
    errors,
  };
}

function learningRows(receipt) {
  const base = {
    schema: 'hololand.learning-signal.v0.1.0',
    generatedAt: receipt.generatedAt,
    sourceReceipt: receipt.receipt.output,
    sourceHash: receipt.source.sha256,
  };
  return [
    {
      ...base,
      type: 'pattern',
      label: 'uaa2_service_seed_as_source_gate',
      input: receipt.seedReview.path,
      output: receipt.source.path,
      evidence: receipt.validation.status,
    },
    {
      ...base,
      type: 'decision',
      label: 'direct_service_dependency_retired',
      content: receipt.decision.summary,
      evidence: receipt.decision.dependencyBoundary,
    },
    {
      ...base,
      type: 'next_action',
      label: 'promote_flagship_adapters',
      command: receipt.nextAction.command,
      evidence: receipt.wildIntake.receipt,
    },
  ];
}

function buildReceipt(args) {
  if (!existsSync(args.source)) throw new Error(`Source file not found: ${args.source}`);
  if (!existsSync(args.seed)) throw new Error(`Seed file not found: ${args.seed}`);

  const sourceText = readFileSync(args.source, 'utf8');
  const seedText = readFileSync(args.seed, 'utf8');
  const sourceStructural = structuralValidation(sourceText, args.source);
  const sourceCli = parseWithHoloScriptCli(args.source);
  const review = seedReview(seedText, args.seed);
  const wild = runWildIntake(args);
  const wildReceipt = wild.receipt || {};
  const wildSummary = wildReceipt.summary || {};
  const validationStatus = [
    sourceStructural.status,
    sourceCli.status,
    review.status === 'reviewed' ? 'pass' : 'fail',
    wild.status,
  ].every((status) => status === 'pass') ? 'pass' : 'fail';

  const generatedAt = new Date().toISOString();
  const receipt = {
    schema: SCHEMA,
    status: validationStatus,
    generatedAt,
    source: {
      path: relativeToRepo(args.source),
      format: 'hsplus',
      sha256: sha256(sourceText),
    },
    seedReview: review,
    decision: {
      outcome: 'promoted_to_build_gate',
      dependencyBoundary: 'HoloLand consumes validated HoloScript source and receipts; uaa2-service remains a read-only corpus or contracted producer, not a direct runtime dependency.',
      summary: 'Promote the seed as a source-first builder gate with read-only intake and adapter receipts; retire the old direct service integration plan from current HoloLand runtime scope.',
      directServiceRuntimeDependency: false,
      HoloLandProjectionIsSourceOfTruth: false,
      generatedHoloScriptCanBeAccepted: true,
      adapterReceiptRequiredForWildSource: true,
    },
    wildIntake: {
      status: wild.status,
      command: wild.command,
      receipt: relativeToRepo(args.wildReceipt),
      browserBootstrap: relativeToRepo(args.wildJs),
      summary: {
        status: wildSummary.status || 'unknown',
        fileCount: wildSummary.fileCount || 0,
        holoCount: wildSummary.holoCount || 0,
        hsCount: wildSummary.hsCount || 0,
        hsplusCount: wildSummary.hsplusCount || 0,
        adapterNeededCount: wildSummary.adapterNeededCount || 0,
        frontierSyntaxCount: wildSummary.frontierSyntaxCount || 0,
        canonicalCandidateCount: wildSummary.canonicalCandidateCount || 0,
        topPattern: wildSummary.topPattern || '',
        nextMove: wildSummary.nextMove || 'attach_or_scan_uaa2_service',
      },
      flagshipPromotionMap: Array.isArray(wildReceipt.holoshellIntakeMap) ? wildReceipt.holoshellIntakeMap : [],
      sourceFilesMutated: Boolean(wildReceipt.invariants?.sourceFilesMutated),
      adapterRequiredForExecution: wildReceipt.invariants?.adapterRequiredForExecution !== false,
      rawSecretsIncluded: false,
    },
    validation: {
      status: validationStatus,
      source: {
        status: sourceStructural.status === 'pass' && sourceCli.status === 'pass' ? 'pass' : 'fail',
        structural: sourceStructural,
        cli: sourceCli,
      },
      seed: {
        status: review.status === 'reviewed' ? 'pass' : 'fail',
        errors: review.errors,
      },
      wildIntake: {
        status: wild.status,
        exitCode: wild.exitCode,
        stdoutTail: wild.stdoutTail,
        stderrTail: wild.stderrTail,
      },
    },
    learningSignal: {
      status: validationStatus === 'pass' ? 'ready' : 'blocked',
      path: relativeToRepo(args.learning),
      labels: ['uaa2_service_seed_as_source_gate', 'direct_service_dependency_retired', 'promote_flagship_adapters'],
      corpusCandidate: validationStatus === 'pass',
    },
    nextAction: {
      status: 'ready',
      command: 'node scripts/holoshell-wild-holoscript-intake.mjs --uaa2-root C:\\Users\\josep\\Documents\\GitHub\\uaa2-service',
      reason: 'Promote the highest-value wild modules through explicit adapter receipts after the read-only scan.',
    },
    receipt: {
      output: relativeToRepo(args.receipt),
      rawSecretsIncluded: false,
    },
  };
  receipt.receipt.sha256 = sha256(JSON.stringify({
    source: receipt.source.sha256,
    seed: receipt.seedReview.sha256,
    decision: receipt.decision.outcome,
    validation: receipt.validation.status,
    wild: receipt.wildIntake.summary,
  }));

  const rows = learningRows(receipt);
  receipt.learningSignal.rowCount = rows.length;
  writeText(args.learning, `${rows.map((row) => JSON.stringify(row)).join('\n')}\n`);
  writeJson(args.receipt, receipt);
  return receipt;
}

function main() {
  try {
    const args = parseArgs();
    if (args.help) {
      console.log(usage());
      return;
    }
    const receipt = buildReceipt(args);
    if (args.json) console.log(JSON.stringify(receipt, null, 2));
    else {
      console.log(`Uaa2ServiceSeedGate: ${receipt.status}`);
      console.log(`receipt: ${receipt.receipt.output}`);
      console.log(`wild intake: ${receipt.wildIntake.receipt}`);
      console.log(`learning signal: ${receipt.learningSignal.path}`);
    }
    process.exit(receipt.status === 'pass' ? 0 : 1);
  } catch (error) {
    console.error(`[uaa2-service-seed-gate] ${error.message}`);
    process.exit(1);
  }
}

main();
