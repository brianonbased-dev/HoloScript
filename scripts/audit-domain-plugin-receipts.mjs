#!/usr/bin/env node
/**
 * Audit solver-backed domain plugins for SimulationContract/CAEL receipt
 * surfaces. This is intentionally heuristic: it identifies candidates for
 * closeout and review, while tests pin the signal rules on fixture plugins.
 */

import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { basename, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const SOLVER_SIGNALS = [
  { id: 'sim-solver', pattern: /\bSimSolver\b/ },
  { id: 'solver-type', pattern: /\b(class|interface|type)\s+[A-Za-z0-9_]*(Solver|Backend|Simulation)\b/ },
  { id: 'power-flow', pattern: /power[-_ ]?flow|reactancePu|lineFlowsMw/i },
  { id: 'quantum', pattern: /\b(QmSolver|VQE|QAOA|Psi4|QuantumEspresso|OpenFermion)\b/i },
  { id: 'robotics-sim', pattern: /\b(Isaac|ROS2|URDF|sim[-_ ]?to[-_ ]?real)\b/i },
  { id: 'bio-sim', pattern: /\b(AlphaFold|alphafold|protein|ligand|docking|binding affinity)\b/i },
  { id: 'fabric-sim', pattern: /\b(FabricSimulation|cloth|garment|soft[-_ ]?body)\b/i },
  { id: 'medical-sim', pattern: /\b(DICOM|surgical|vitals|blood_flow|patient)\b/i },
];

export const RECEIPT_SIGNALS = [
  { id: 'receipt-builder', pattern: /\bbuild[A-Za-z0-9_]*Receipt\b/ },
  { id: 'receipt-schema', pattern: /\b(RECEIPT_SCHEMA|receiptSchema|schema:\s*['"][^'"]*receipt)/ },
  { id: 'cael', pattern: /\b(CAEL|cael\.v1|cael:)\b/i },
  { id: 'simulation-contract', pattern: /\b(SimulationContract|ContractedSimulation)\b/ },
  { id: 'acceptance-envelope', pattern: /\b(acceptance|accepted|violations)\b/ },
];

const DEFAULT_IGNORE_DIRS = new Set(['node_modules', 'dist', '.turbo', 'coverage']);

export function auditDomainPluginReceipts(options = {}) {
  const repoRoot = resolve(options.repoRoot ?? defaultRepoRoot());
  const pluginRoot = resolve(options.pluginRoot ?? join(repoRoot, 'packages', 'plugins'));
  const plugins = listPluginDirs(pluginRoot);
  const rows = plugins.map((pluginDir) => auditPlugin(repoRoot, pluginDir));

  return {
    schema: 'holoscript.domain-plugin-receipt-audit.v0.1.0',
    pluginRoot: relative(repoRoot, pluginRoot).replaceAll('\\', '/'),
    generatedAt: options.generatedAt ?? new Date().toISOString(),
    rows,
    missingReceiptRows: rows.filter((row) => row.solverBacked && !row.receiptBacked),
  };
}

export function auditPlugin(repoRoot, pluginDir) {
  const packagePath = join(pluginDir, 'package.json');
  const manifest = existsSync(packagePath)
    ? JSON.parse(readFileSync(packagePath, 'utf8'))
    : { name: basename(pluginDir) };
  const files = listSourceFiles(pluginDir);
  const source = files.map((file) => readFileSync(file, 'utf8')).join('\n');
  const solverSignals = matchSignals(source, SOLVER_SIGNALS);
  const receiptSignals = matchSignals(source, RECEIPT_SIGNALS);
  const packageDir = relative(repoRoot, pluginDir).replaceAll('\\', '/');

  return {
    packageName: manifest.name ?? basename(pluginDir),
    packageDir,
    solverBacked: solverSignals.length > 0,
    receiptBacked: receiptSignals.length > 0,
    solverSignals,
    receiptSignals,
    recommendation: recommendationFor(solverSignals, receiptSignals),
  };
}

export function listPluginDirs(pluginRoot) {
  if (!existsSync(pluginRoot)) return [];
  return readdirSync(pluginRoot)
    .map((name) => join(pluginRoot, name))
    .filter((entry) => statSync(entry).isDirectory())
    .filter((entry) => existsSync(join(entry, 'package.json')))
    .sort((a, b) => basename(a).localeCompare(basename(b)));
}

export function listSourceFiles(root) {
  const srcRoot = join(root, 'src');
  const start = existsSync(srcRoot) ? srcRoot : root;
  const files = [];
  walk(start, files);
  return files.filter((file) => /\.(ts|tsx|js|mjs|cjs)$/.test(file));
}

function walk(dir, files) {
  for (const name of readdirSync(dir)) {
    if (DEFAULT_IGNORE_DIRS.has(name)) continue;
    const entry = join(dir, name);
    const stat = statSync(entry);
    if (stat.isDirectory()) {
      walk(entry, files);
    } else if (stat.isFile()) {
      files.push(entry);
    }
  }
}

function matchSignals(source, signals) {
  return signals.filter((signal) => signal.pattern.test(source)).map((signal) => signal.id);
}

function recommendationFor(solverSignals, receiptSignals) {
  if (solverSignals.length === 0) return 'not-solver-backed';
  if (receiptSignals.length > 0) return 'receipt-surface-present';
  return 'add-simulationcontract-receipt';
}

function defaultRepoRoot() {
  return resolve(fileURLToPath(new URL('..', import.meta.url)));
}

function printHuman(audit) {
  console.log(`Domain plugin receipt audit (${audit.schema})`);
  console.log(`Plugin root: ${audit.pluginRoot}`);
  console.log('');
  for (const row of audit.rows) {
    if (!row.solverBacked) continue;
    const status = row.receiptBacked ? 'receipt-present' : 'missing-receipt';
    console.log(`${status.padEnd(16)} ${row.packageName}`);
    console.log(`  dir: ${row.packageDir}`);
    console.log(`  solver signals: ${row.solverSignals.join(', ') || 'none'}`);
    console.log(`  receipt signals: ${row.receiptSignals.join(', ') || 'none'}`);
    console.log(`  recommendation: ${row.recommendation}`);
  }
  if (audit.missingReceiptRows.length === 0) {
    console.log('');
    console.log('No solver-backed plugin receipt gaps detected by current heuristics.');
  }
}

const isMain = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const asJson = process.argv.includes('--json');
  const missingOnly = process.argv.includes('--missing-only');
  const audit = auditDomainPluginReceipts();
  if (asJson) {
    const output = missingOnly ? { ...audit, rows: audit.missingReceiptRows } : audit;
    console.log(JSON.stringify(output, null, 2));
  } else {
    printHuman(audit);
  }
}
