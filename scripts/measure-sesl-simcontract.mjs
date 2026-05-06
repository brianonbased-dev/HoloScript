#!/usr/bin/env node
/**
 * Measure Paper 17 SESL SimContract pass rate from a JSONL corpus or INDEX.
 *
 * The harness is deliberately strict: static corpus success is not treated as
 * SimulationContract success. A record is measurable only when it carries an
 * explicit SimContract field such as simContractCheck.passed,
 * sim_contract_passed, or per-mutation sim_contract_passed values.
 *
 * Usage:
 *   node scripts/measure-sesl-simcontract.mjs --input=research/paper-17-sesl-pairs/phase-1-corpus.jsonl --json
 *   node scripts/measure-sesl-simcontract.mjs --input=research/paper-17-sesl-pairs/fixtures/simcontract-measurement-smoke.ndjson --target-pairs=4
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, '..');
const HOME = process.env.USERPROFILE || os.homedir();

const args = parseArgs(process.argv.slice(2));
const targetPairs = Number(args['target-pairs'] ?? 5000);
const targetPassRate = Number(args['target-pass-rate'] ?? 0.6);
const maxRecords = args['max-records'] === undefined ? Infinity : Number(args['max-records']);
const format = args.markdown ? 'markdown' : 'json';
const inputPath = resolveInputPath(args.input || args._[0]);

if (!Number.isFinite(targetPairs) || targetPairs < 0) {
  failCli('--target-pairs must be a non-negative number');
}
if (!Number.isFinite(targetPassRate) || targetPassRate < 0 || targetPassRate > 1) {
  failCli('--target-pass-rate must be between 0 and 1');
}
if (!Number.isFinite(maxRecords) && maxRecords !== Infinity) {
  failCli('--max-records must be a number');
}

const measurement = measureInput(inputPath, { targetPairs, targetPassRate, maxRecords });

if (format === 'markdown') {
  console.log(toMarkdown(measurement));
} else {
  console.log(JSON.stringify(measurement, null, 2));
}

if (args['fail-gate'] && !measurement.gate.gateCleared) {
  process.exit(2);
}

function parseArgs(argv) {
  const out = { _: [] };
  for (const arg of argv) {
    if (!arg.startsWith('--')) {
      out._.push(arg);
      continue;
    }
    const body = arg.slice(2);
    const eq = body.indexOf('=');
    if (eq === -1) {
      out[body] = true;
    } else {
      out[body.slice(0, eq)] = body.slice(eq + 1);
    }
  }
  return out;
}

function resolveInputPath(explicit) {
  const candidates = [
    explicit,
    process.env.SESL_CORPUS_PATH,
    path.join(REPO_ROOT, 'research', 'paper-17-sesl-pairs', 'phase-1-corpus.jsonl'),
    path.join(REPO_ROOT, 'research', 'paper-17-sesl-pairs', 'INDEX.json'),
    path.join(HOME, '.ai-ecosystem', 'research', 'paper-17-sesl-corpus', 'phase-1-corpus.jsonl'),
    path.join(HOME, '.ai-ecosystem', 'research', 'paper-17-sesl-corpus', 'phase-0-corpus.jsonl'),
    path.join(HOME, '.ai-ecosystem', 'research', 'paper-17-sesl-pairs', 'INDEX.json'),
  ].filter(Boolean);

  for (const candidate of candidates) {
    const resolved = path.resolve(String(candidate));
    if (fs.existsSync(resolved)) return resolved;
  }

  failCli(
    [
      'No SESL corpus input found.',
      'Pass --input=<jsonl-or-index-json> or set SESL_CORPUS_PATH.',
      `Checked: ${candidates.map((c) => path.resolve(String(c))).join('; ')}`,
    ].join(' '),
  );
}

function measureInput(input, options) {
  const raw = fs.readFileSync(input, 'utf8');
  const ext = path.extname(input).toLowerCase();

  if (ext === '.json') {
    const doc = JSON.parse(raw);
    const summary = summaryFromIndexLike(doc, input, options);
    if (summary) return summary;
    const records = Array.isArray(doc) ? doc : doc.records || doc.pairs || [];
    return summarizeRecords(records, input, { ...options, sourceKind: 'json-records' });
  }

  const records = [];
  let malformed = 0;
  const lines = raw.split(/\r?\n/);
  for (let index = 0; index < lines.length && records.length < options.maxRecords; index += 1) {
    const line = lines[index].trim();
    if (!line) continue;
    try {
      records.push(JSON.parse(line));
    } catch {
      malformed += 1;
    }
  }

  const summary = summarizeRecords(records, input, { ...options, sourceKind: 'jsonl-corpus' });
  summary.counts.malformedRecords = malformed;
  return summary;
}

function summaryFromIndexLike(doc, input, options) {
  const gate = doc.gate || doc;
  const totals = doc.totals || {};
  const passed = numeric(totals.passed) ?? numeric(gate.passed);
  const failed = numeric(totals.failed) ?? numeric(gate.failed);
  const totalRecordsFromIndex =
    numeric(gate.pairs_collected) ??
    numeric(gate.total_records) ??
    numeric(gate.totalRecords) ??
    numeric(totals.totalRecords);
  const caelVerifiedPairs =
    numeric(gate.cael_verified_pairs) ??
    numeric(gate.caelVerifiedPairs) ??
    numeric(totals.cael_verified_pairs) ??
    numeric(totals.caelVerifiedPairs) ??
    0;
  const staticSeedPairs =
    numeric(gate.static_seed_pairs) ??
    numeric(gate.staticSeedPairs) ??
    numeric(totals.static_seed_pairs) ??
    numeric(totals.staticSeedPairs) ??
    Math.max(0, (totalRecordsFromIndex ?? 0) - caelVerifiedPairs);
  const labeled =
    numeric(gate.pairs_labeled) ??
    numeric(gate.measured_pairs) ??
    (passed !== null && failed !== null ? passed + failed : null);
  const passRate = numeric(gate.pass_rate);

  if (passed === null && failed === null && labeled === null && passRate === null) {
    return null;
  }

  const measuredPairs = labeled ?? (passed ?? 0) + (failed ?? 0);
  const passRateComputed =
    passRate ??
    (measuredPairs > 0 && passed !== null ? round(passed / measuredPairs, 6) : null);
  const passRateOk = passRateComputed !== null && passRateComputed >= options.targetPassRate;
  const volumeOk = measuredPairs >= options.targetPairs;
  const caelVolumeOk = caelVerifiedPairs >= options.targetPairs;

  return {
    schemaVersion: '0.1.0',
    measuredAt: new Date().toISOString(),
    inputPath: input,
    sourceKind: 'index-summary',
    targets: {
      targetPairs: options.targetPairs,
      targetPassRate: options.targetPassRate,
    },
    counts: {
      totalRecords: totalRecordsFromIndex ?? measuredPairs,
      measuredPairs,
      caelVerifiedPairs,
      staticSeedPairs,
      passed: passed ?? (passRateComputed !== null ? Math.round(passRateComputed * measuredPairs) : 0),
      failed: failed ?? (passRateComputed !== null ? measuredPairs - Math.round(passRateComputed * measuredPairs) : 0),
      unmeasuredPairs: Math.max(0, (totalRecordsFromIndex ?? measuredPairs) - measuredPairs),
      malformedRecords: numeric(totals.malformed) ?? 0,
    },
    passRate: passRateComputed,
    gate: {
      passRateOk,
      volumeOk,
      gateCleared: passRateOk && volumeOk,
      caelVolumeOk,
      paper17GateCleared: passRateOk && caelVolumeOk,
    },
    ceiling:
      measuredPairs === 0
        ? {
            kind: 'no-simcontract-measurements',
            message:
              'No explicit SimContract measurements are present yet; pass rate is not computable from this input.',
          }
        : null,
    bySource: {},
    byOutcome: {},
    missingReasons: {},
    caelMissingReasons: {},
  };
}

function summarizeRecords(records, input, options) {
  const counts = {
    totalRecords: records.length,
    measuredPairs: 0,
    caelVerifiedPairs: 0,
    staticSeedPairs: 0,
    passed: 0,
    failed: 0,
    unmeasuredPairs: 0,
    malformedRecords: 0,
  };
  const bySource = {};
  const byOutcome = {};
  const missingReasons = {};
  const caelMissingReasons = {};

  for (const record of records) {
    increment(bySource, String(record.source || record.phase || 'unknown'));
    increment(byOutcome, String(record.outcome || 'unknown'));

    const cael = extractCaelVerification(record);
    if (cael.verified) {
      counts.caelVerifiedPairs += 1;
    } else {
      counts.staticSeedPairs += 1;
      increment(caelMissingReasons, cael.reason || 'no_cael_trace');
    }

    const measurement = extractSimContractMeasurement(record);
    if (measurement.measured) {
      counts.measuredPairs += 1;
      if (measurement.passed) counts.passed += 1;
      else counts.failed += 1;
    } else {
      counts.unmeasuredPairs += 1;
      increment(missingReasons, measurement.reason || 'no_simcontract_field');
    }
  }

  const passRate =
    counts.measuredPairs > 0 ? round(counts.passed / counts.measuredPairs, 6) : null;
  const passRateOk = passRate !== null && passRate >= options.targetPassRate;
  const volumeOk = counts.measuredPairs >= options.targetPairs;
  const caelVolumeOk = counts.caelVerifiedPairs >= options.targetPairs;

  return {
    schemaVersion: '0.1.0',
    measuredAt: new Date().toISOString(),
    inputPath: input,
    sourceKind: options.sourceKind,
    targets: {
      targetPairs: options.targetPairs,
      targetPassRate: options.targetPassRate,
    },
    counts,
    passRate,
    gate: {
      passRateOk,
      volumeOk,
      gateCleared: passRateOk && volumeOk,
      caelVolumeOk,
      paper17GateCleared: passRateOk && caelVolumeOk,
    },
    ceiling:
      counts.measuredPairs === 0
        ? {
            kind: 'phase0-static-corpus',
            message:
              'The corpus contains no explicit SimContract measurements; this is a ceiling report, not a pass-rate result.',
          }
        : null,
    bySource,
    byOutcome,
    missingReasons,
    caelMissingReasons,
  };
}

function extractCaelVerification(record) {
  const direct = firstBoolean([
    record.cael_hash_chain_valid,
    record.caelHashChainValid,
    record.cael_trace?.hash_chain_valid,
    record.cael_trace?.hashChain?.valid,
    record.cael_trace?.verification?.valid,
    record.caelTrace?.hash_chain_valid,
    record.caelTrace?.hashChain?.valid,
    record.caelTrace?.verification?.valid,
  ]);
  const hasTrace = Boolean(
    record.cael_trace ||
    record.caelTrace ||
    record.cael_trace_hash ||
    record.caelTraceHash,
  );
  if (direct === true && hasTrace) return { verified: true, reason: 'hash_chain_valid' };
  if (hasTrace) return { verified: false, reason: 'cael_trace_unverified' };
  return { verified: false, reason: 'no_cael_trace' };
}

function extractSimContractMeasurement(record) {
  const direct = firstBoolean([
    record.sim_contract_passed,
    record.simContractPassed,
    record.simContractCheck?.passed,
    record.sim_contract_check?.passed,
    record.verification?.simContractCheck?.passed,
    record.metrics?.simContractCheck?.passed,
    record.caelTrace?.simContractCheck?.passed,
    record.cael_trace?.simContractCheck?.passed,
  ]);
  if (direct !== null) return { measured: true, passed: direct, reason: 'direct' };

  const resultValue = firstResult([
    record.simContractCheck?.result,
    record.sim_contract_check?.result,
    record.verification?.simContractCheck?.result,
    record.metrics?.simContractCheck?.result,
  ]);
  if (resultValue !== null) return { measured: true, passed: resultValue, reason: 'result' };

  const mutationChecks = [];
  for (const key of ['scene_mutations', 'sceneMutations', 'mutations', 'tool_calls', 'toolCalls']) {
    if (!Array.isArray(record[key])) continue;
    for (const mutation of record[key]) {
      const value = firstBoolean([
        mutation.sim_contract_passed,
        mutation.simContractPassed,
        mutation.simContractCheck?.passed,
        mutation.sim_contract_check?.passed,
      ]);
      if (value !== null) mutationChecks.push(value);
    }
  }
  if (mutationChecks.length > 0) {
    return {
      measured: true,
      passed: mutationChecks.every(Boolean),
      reason: 'mutation_checks',
    };
  }

  return { measured: false, passed: false, reason: 'no_explicit_simcontract_measurement' };
}

function firstBoolean(values) {
  for (const value of values) {
    if (typeof value === 'boolean') return value;
    if (typeof value === 'string') {
      const normalized = value.toLowerCase();
      if (['true', 'pass', 'passed', 'success'].includes(normalized)) return true;
      if (['false', 'fail', 'failed', 'rejected'].includes(normalized)) return false;
    }
  }
  return null;
}

function firstResult(values) {
  for (const value of values) {
    if (typeof value !== 'string') continue;
    const normalized = value.toLowerCase();
    if (['pass', 'passed', 'success'].includes(normalized)) return true;
    if (['fail', 'failed', 'rejected'].includes(normalized)) return false;
  }
  return null;
}

function numeric(value) {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

function increment(obj, key) {
  obj[key] = (obj[key] || 0) + 1;
}

function round(value, places) {
  const factor = 10 ** places;
  return Math.round(value * factor) / factor;
}

function toMarkdown(summary) {
  const pct = summary.passRate === null ? 'null' : `${round(summary.passRate * 100, 2)}%`;
  const lines = [
    '# SESL SimContract Pass-Rate Measurement',
    '',
    `- Input: \`${summary.inputPath}\``,
    `- Source kind: \`${summary.sourceKind}\``,
    `- Total records: ${summary.counts.totalRecords}`,
    `- Measured pairs: ${summary.counts.measuredPairs}`,
    `- CAEL-verified pairs: ${summary.counts.caelVerifiedPairs}`,
    `- Static/unverified seed pairs: ${summary.counts.staticSeedPairs}`,
    `- Passed: ${summary.counts.passed}`,
    `- Failed: ${summary.counts.failed}`,
    `- Pass rate: ${pct}`,
    `- Target: ${summary.targets.targetPairs} pairs at ${summary.targets.targetPassRate}`,
    `- Gate cleared: ${summary.gate.gateCleared}`,
    `- Paper 17 CAEL gate cleared: ${summary.gate.paper17GateCleared}`,
  ];
  if (summary.ceiling) {
    lines.push('', `Ceiling: ${summary.ceiling.message}`);
  }
  return `${lines.join('\n')}\n`;
}

function failCli(message) {
  console.error(`[measure-sesl-simcontract] ${message}`);
  process.exit(1);
}
