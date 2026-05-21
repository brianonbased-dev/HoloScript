#!/usr/bin/env npx tsx
/**
 * FleetCalibrationAnalyzer — Paper 22/32 table generator
 *
 * Reads a fleet calibration JSONL produced by FleetCalibrationCollector and
 * outputs:
 *   1. Joint (B,S) heatmap — 5×5 grid of (B_score, S_score) frequency
 *   2. False-negative rate table — Axis-1-only vs. two-axis filter
 *   3. Per-domain sycophancy prevalence
 *   4. Agent-hour accumulation summary
 *   5. LaTeX snippets ready to paste into Paper 22 §5 and Paper 32 §6
 *
 * Usage:
 *   npx tsx FleetCalibrationAnalyzer.ts <path-to-jsonl>
 *   # or via env: FLEET_CAL_JSONL=/path/to/file.jsonl npx tsx ...
 *
 * References:
 *   Paper 22 §5 — planned evaluation: joint (B,S) + false-negative rate
 *   Paper 32 §5 — token comparison + slice diversity
 *   Synthetic baseline — research/paper-22-ati/calibration-2026-05-21.json
 */

import * as fs   from 'node:fs';
import * as path from 'node:path';
import * as os   from 'node:os';

import type { CalibrationRecord } from './FleetCalibrationCollector';

// ─── Load JSONL ───────────────────────────────────────────────────────────────

function loadRecords(filePath: string): CalibrationRecord[] {
  const lines = fs.readFileSync(filePath, 'utf8')
    .split('\n')
    .filter(l => l.trim().length > 0);

  const records: CalibrationRecord[] = [];
  for (const line of lines) {
    try {
      const obj = JSON.parse(line) as Record<string, unknown>;
      // Skip header and checkpoint records
      if (obj['_type']) continue;
      records.push(obj as CalibrationRecord);
    } catch {
      // malformed line — skip
    }
  }
  return records;
}

// ─── Joint (B,S) heatmap ─────────────────────────────────────────────────────

type HeatmapCell = { b_bin: number; s_bin: number; count: number; frac: number };

function buildHeatmap(records: CalibrationRecord[], bins = 5): HeatmapCell[] {
  const grid: number[][] = Array.from({ length: bins }, () => new Array(bins).fill(0) as number[]);

  for (const rec of records) {
    const b = Math.min(Math.floor(rec.B_score * bins), bins - 1);
    const s = Math.min(Math.floor(rec.S_score * bins), bins - 1);
    grid[b]![s]! += 1;
  }

  const total = records.length || 1;
  const cells: HeatmapCell[] = [];
  for (let b = 0; b < bins; b++) {
    for (let s = 0; s < bins; s++) {
      cells.push({ b_bin: b, s_bin: s, count: grid[b]![s]!, frac: grid[b]![s]! / total });
    }
  }
  return cells;
}

// ─── False-negative analysis ──────────────────────────────────────────────────

interface FNStats {
  total: number;
  axis1_only_catch: number;   // B_dirty only
  axis2_only_catch: number;   // S_dirty only (axis-1 false negative)
  both_catch: number;          // B_dirty AND S_dirty
  neither_catch: number;       // clean
  axis1_fn_rate: number;       // axis2_only_catch / (axis1_only_catch + axis2_only_catch + both)
}

function computeFNStats(records: CalibrationRecord[]): FNStats {
  let axis1_only = 0, axis2_only = 0, both = 0, neither = 0;
  for (const r of records) {
    if (r.is_byzantine && !r.is_sycophantic)  axis1_only++;
    else if (!r.is_byzantine && r.is_sycophantic) axis2_only++;
    else if (r.is_byzantine && r.is_sycophantic)  both++;
    else neither++;
  }
  const detected = axis1_only + axis2_only + both;
  const fn_rate  = detected > 0 ? axis2_only / detected : 0;
  return {
    total: records.length,
    axis1_only_catch: axis1_only,
    axis2_only_catch: axis2_only,
    both_catch: both,
    neither_catch: neither,
    axis1_fn_rate: fn_rate,
  };
}

// ─── Per-domain sycophancy ────────────────────────────────────────────────────

interface DomainSyco {
  domain: string;
  count: number;
  syco_count: number;
  syco_rate: number;
}

function computeDomainSyco(records: CalibrationRecord[]): DomainSyco[] {
  const domainMap = new Map<string, { count: number; syco: number }>();
  for (const r of records) {
    const d = r.domain ?? 'unknown';
    const entry = domainMap.get(d) ?? { count: 0, syco: 0 };
    entry.count++;
    if (r.is_sycophantic) entry.syco++;
    domainMap.set(d, entry);
  }
  return Array.from(domainMap.entries())
    .map(([domain, { count, syco }]) => ({
      domain,
      count,
      syco_count: syco,
      syco_rate:  count > 0 ? syco / count : 0,
    }))
    .sort((a, b) => b.syco_rate - a.syco_rate);
}

// ─── Agent-hour summary ───────────────────────────────────────────────────────

function computeAgentHours(records: CalibrationRecord[]): { unique_agents: number; agent_hours: number } {
  const ahSet = new Set(records.map(r => r.hour_bucket));
  const agentSet = new Set(records.map(r => r.agent_id));
  return { unique_agents: agentSet.size, agent_hours: ahSet.size };
}

// ─── LaTeX snippet generators ─────────────────────────────────────────────────

function latexFNTable(fn: FNStats): string {
  const fnPct = (fn.axis1_fn_rate * 100).toFixed(1);
  return [
    '% ── False-negative rate (Paper 22 §5, fleet calibration) ──',
    '\\begin{table}[h]',
    '\\centering\\small',
    '\\caption{Two-axis filter vs.\ Axis-1-only: false-negative rate on live fleet.}',
    '\\label{tab:fleet-fn}',
    '\\begin{tabular}{lrr}',
    '\\toprule',
    'Category & Count & Rate (\\%) \\\\',
    '\\midrule',
    `Total observations & ${fn.total} & — \\\\`,
    `Axis-1 only (Byzantine) & ${fn.axis1_only_catch} & ${fn.total > 0 ? ((fn.axis1_only_catch/fn.total)*100).toFixed(1) : '—'} \\\\`,
    `Axis-2 only (Sycophancy) & ${fn.axis2_only_catch} & ${fn.total > 0 ? ((fn.axis2_only_catch/fn.total)*100).toFixed(1) : '—'} \\\\`,
    `Both axes flagged & ${fn.both_catch} & ${fn.total > 0 ? ((fn.both_catch/fn.total)*100).toFixed(1) : '—'} \\\\`,
    `Clean (neither) & ${fn.neither_catch} & ${fn.total > 0 ? ((fn.neither_catch/fn.total)*100).toFixed(1) : '—'} \\\\`,
    '\\midrule',
    `\\textbf{Axis-1-only false-negative rate} & ${fn.axis2_only_catch} & \\textbf{${fnPct}\\%} \\\\`,
    '\\bottomrule',
    '\\end{tabular}',
    '\\end{table}',
  ].join('\n');
}

function latexDomainTable(domains: DomainSyco[]): string {
  const rows = domains.slice(0, 10).map(d =>
    `${d.domain} & ${d.count} & ${(d.syco_rate * 100).toFixed(1)}\\% \\\\`
  );
  return [
    '% ── Per-domain sycophancy prevalence (Paper 22 §5) ──',
    '\\begin{table}[h]',
    '\\centering\\small',
    '\\caption{Sycophancy prevalence by PillarDomain (fleet calibration).}',
    '\\label{tab:fleet-domain-syco}',
    '\\begin{tabular}{lrr}',
    '\\toprule',
    'Domain & Observations & Syco rate (\\%) \\\\',
    '\\midrule',
    ...rows,
    '\\bottomrule',
    '\\end{tabular}',
    '\\end{table}',
  ].join('\n');
}

function latexHeatmap(cells: HeatmapCell[], bins: number): string {
  // Render as a simple tabular (bins × bins), row = B bin, col = S bin
  const header = `% B\\\\S & ${Array.from({ length: bins }, (_, i) => `[${(i/bins).toFixed(1)},{${((i+1)/bins).toFixed(1)}})`).join(' & ')} \\\\`;
  const rows: string[] = [];
  for (let b = 0; b < bins; b++) {
    const label = `[${(b/bins).toFixed(1)},{${((b+1)/bins).toFixed(1)}})`;
    const cols = cells
      .filter(c => c.b_bin === b)
      .sort((a, z) => a.s_bin - z.s_bin)
      .map(c => (c.frac * 100).toFixed(1) + '\\%');
    rows.push(`${label} & ${cols.join(' & ')} \\\\`);
  }
  return [
    '% ── Joint (B,S) heatmap (Paper 22 §5) ──',
    '% Row = B_score bin, Col = S_score bin, Value = % of observations',
    header,
    ...rows,
  ].join('\n');
}

// ─── Main ─────────────────────────────────────────────────────────────────────

function main(): void {
  const filePath = process.argv[2]
    ?? process.env['FLEET_CAL_JSONL']
    ?? path.join(os.homedir(), '.ai-ecosystem', 'research', 'paper-22-ati',
        `fleet-calibration-${new Date().toISOString().slice(0, 10)}.jsonl`);

  if (!fs.existsSync(filePath)) {
    console.error(`[Analyzer] File not found: ${filePath}`);
    console.error('[Analyzer] Run FleetCalibrationCollector first.');
    process.exit(1);
  }

  console.log(`[Analyzer] Reading: ${filePath}`);
  const records = loadRecords(filePath);
  console.log(`[Analyzer] Loaded ${records.length} observation records`);

  if (records.length === 0) {
    console.warn('[Analyzer] No observation records found. Fleet may not be active yet.');
    process.exit(0);
  }

  const fn       = computeFNStats(records);
  const domains  = computeDomainSyco(records);
  const { unique_agents, agent_hours } = computeAgentHours(records);
  const heatmap  = buildHeatmap(records, 5);

  // ── Summary ──
  console.log('\n═══ Fleet Calibration Summary ═══');
  console.log(`Observations:    ${records.length}`);
  console.log(`Unique agents:   ${unique_agents}`);
  console.log(`Agent-hours:     ${agent_hours}`);
  console.log(`Byzantine rate:  ${(fn.axis1_only_catch / records.length * 100).toFixed(2)}%`);
  console.log(`Sycophancy rate: ${((fn.axis2_only_catch + fn.both_catch) / records.length * 100).toFixed(2)}%`);
  console.log(`Axis-1 FN rate:  ${(fn.axis1_fn_rate * 100).toFixed(2)}%`);

  // ── Domain breakdown ──
  console.log('\n═══ Per-Domain Sycophancy ═══');
  for (const d of domains.slice(0, 10)) {
    const bar = '█'.repeat(Math.round(d.syco_rate * 20));
    console.log(`  ${d.domain.padEnd(20)} ${bar.padEnd(20)} ${(d.syco_rate * 100).toFixed(1)}% (n=${d.count})`);
  }

  // ── LaTeX output ──
  const outBase = filePath.replace(/\.jsonl$/, '');
  const texOut  = `${outBase}-tables.tex`;

  const texContent = [
    `% Fleet Calibration Tables — generated ${new Date().toISOString()}`,
    `% Source: ${filePath}`,
    `% Records: ${records.length}  Agent-hours: ${agent_hours}`,
    '',
    latexFNTable(fn),
    '',
    latexDomainTable(domains),
    '',
    latexHeatmap(heatmap, 5),
  ].join('\n');

  fs.writeFileSync(texOut, texContent, 'utf8');
  console.log(`\n[Analyzer] LaTeX tables written: ${texOut}`);

  // ── JSON summary ──
  const jsonOut = `${outBase}-summary.json`;
  const summary = {
    generatedAt: new Date().toISOString(),
    source: filePath,
    records: records.length,
    unique_agents,
    agent_hours,
    fn_stats: fn,
    domain_sycophancy: domains,
    paper_22_gate_met: agent_hours >= 6048,
  };
  fs.writeFileSync(jsonOut, JSON.stringify(summary, null, 2), 'utf8');
  console.log(`[Analyzer] Summary JSON written: ${jsonOut}`);

  if (agent_hours < 6048) {
    console.warn(`\n[Analyzer] ⚠ Only ${agent_hours}/6048 agent-hours collected.`);
    console.warn('[Analyzer]   Paper 22/32 gate not yet met — continue collection.');
  } else {
    console.log('\n[Analyzer] ✓ 6048 agent-hour gate met — Paper 22/32 measurement complete.');
  }
}

main();
