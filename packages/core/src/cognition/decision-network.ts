// Decision-network cognition surface — turn an agent's stream of decisions into a
// NATIVE, receipt-bound picture, laid out automatically. Agents (Claude, Codex, …) record
// decisions as they work; this builds the .holo and renders it via the sovereign
// SVGCompiler. No hand-placed coordinates — the layout is topological, so a live stream of
// events draws itself. Consumable from @holoscript/core (npm) and the holoscript pypi SDK.
//
// Founder intent: stop babysitting invisible telemetry — SEE the thought network, native,
// on your laptop. This is the library layer; a CLI (bin/holo-decision) + a pypi client feed
// the SAME JSONL event log so both families render into one shared, live surface.

import { HoloCompositionParser } from '../parser/HoloCompositionParser';
import { SVGCompiler } from '../compiler/SVGCompiler';

/** One decision/finding an agent made, with the receipt (evidence) and what caused it. */
export interface DecisionEvent {
  /** Stable node id (referenced by other events' `causes`). */
  id: string;
  /** Short human label shown on the node. */
  label: string;
  /** The evidence riding on the node — commit hash, verdict, test result. */
  receipt?: string;
  /** Status → node colour. shipped|bug|problem|judge|audit|meta|open (free text tolerated). */
  status?: string;
  /** ids of the decisions that led to this one (edges point cause → this). */
  causes?: string[];
  /** Which agent recorded it (claude/codex/…), for a live multi-family stream. */
  agent?: string;
  /** Optional monotonic sequence / timestamp passed IN (scripts have no clock). */
  seq?: number;
}

export interface DecisionNetworkOptions {
  title?: string;
  rowSpacing?: number; // world units between depth rows (default 2.3)
  colSpacing?: number; // world units between siblings in a row (default 3.6)
  nodeWidth?: number; // world units (default 4.6)
  nodeDepth?: number; // world units, box "height" in top-down (default 1.4)
}

const STATUS_COLOR: Record<string, string> = {
  problem: '#6f3a2f',
  blocker: '#6f3a2f',
  fail: '#6f3a2f',
  bug: '#7a5a2f',
  finding: '#7a5a2f',
  warn: '#7a5a2f',
  risk: '#7a5a2f',
  shipped: '#2f6f4f',
  done: '#2f6f4f',
  pass: '#2f6f4f',
  green: '#2f6f4f',
  judge: '#2f4f7f',
  audit: '#2f4f7f',
  info: '#2f4f7f',
  running: '#2f4f7f',
  meta: '#4f2f6f',
  current: '#4f2f6f',
  this: '#4f2f6f',
  open: '#3a4250',
  todo: '#3a4250',
  pending: '#3a4250',
};
const DEFAULT_COLOR = '#2f4f7f';
const EDGE_COLOR = '#8aa0b4';

function colorFor(status?: string): string {
  return (
    STATUS_COLOR[
      String(status ?? '')
        .trim()
        .toLowerCase()
    ] ?? DEFAULT_COLOR
  );
}

/** Topological depth of each node (0 = root); cycle- and missing-cause-safe. */
function computeDepths(events: DecisionEvent[]): Map<string, number> {
  const byId = new Map(events.map((e) => [e.id, e]));
  const depth = new Map<string, number>();
  const visiting = new Set<string>();
  const of = (id: string): number => {
    if (depth.has(id)) return depth.get(id)!;
    const e = byId.get(id);
    if (!e || !e.causes || e.causes.length === 0) {
      depth.set(id, 0);
      return 0;
    }
    if (visiting.has(id)) return 0; // cycle guard
    visiting.add(id);
    let d = 0;
    for (const c of e.causes) if (byId.has(c)) d = Math.max(d, of(c) + 1);
    visiting.delete(id);
    depth.set(id, d);
    return d;
  };
  for (const e of events) of(e.id);
  return depth;
}

/** Escape a value for a .holo double-quoted string. */
function q(s: string): string {
  return String(s).replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

/**
 * Build the .holo composition for a decision stream — auto-laid-out (topological rows,
 * siblings spread on x), receipt-bound nodes, cause→effect edges. Pure/deterministic.
 */
export function buildDecisionHolo(
  events: DecisionEvent[],
  opts: DecisionNetworkOptions = {}
): string {
  const rowSpacing = opts.rowSpacing ?? 2.3;
  const colSpacing = opts.colSpacing ?? 5.6;
  const nodeW = opts.nodeWidth ?? 4.6;
  const nodeD = opts.nodeDepth ?? 1.4;
  const title = opts.title ?? 'HoloMind · decision network';

  const seen = new Set<string>();
  const nodes = events.filter((e) => e.id && !seen.has(e.id) && seen.add(e.id));
  const depths = computeDepths(nodes);
  const maxDepth = Math.max(0, ...nodes.map((n) => depths.get(n.id) ?? 0));

  // group by depth, preserving insertion order within a row
  const rows = new Map<number, DecisionEvent[]>();
  for (const n of nodes) {
    const d = depths.get(n.id) ?? 0;
    if (!rows.has(d)) rows.set(d, []);
    rows.get(d)!.push(n);
  }

  const zCenter = (maxDepth * rowSpacing) / 2;
  const pos = new Map<string, { x: number; z: number }>();
  for (const [d, row] of rows) {
    const n = row.length;
    const xStart = -((n - 1) * colSpacing) / 2;
    row.forEach((node, i) =>
      pos.set(node.id, { x: xStart + i * colSpacing, z: d * rowSpacing - zCenter })
    );
  }

  const lines: string[] = [];
  lines.push(`composition "DecisionNetwork" {`);
  lines.push(
    `  object "Title" { geometry: "text"; position: [0, 0, ${(-zCenter - 1.35).toFixed(2)}]; text: "${q(title)}"; size: 14; color: "#dfeaf2" }`
  );
  for (const node of nodes) {
    const p = pos.get(node.id)!;
    const receipt = node.receipt ? `; receipt: "${q(node.receipt)}"` : '';
    lines.push(
      `  object "${q(node.id)}" { geometry: "box"; position: [${p.x.toFixed(2)}, 0, ${p.z.toFixed(2)}]; scale: [${nodeW}, 1, ${nodeD}]; color: "${colorFor(node.status)}"; label: "${q(node.label)}"${receipt} }`
    );
  }
  let ei = 0;
  for (const node of nodes) {
    for (const c of node.causes ?? []) {
      if (pos.has(c))
        lines.push(
          `  object "e${ei++}" { geometry: "edge"; source: "${q(c)}"; target: "${q(node.id)}"; color: "${EDGE_COLOR}" }`
        );
    }
  }
  lines.push('}');
  return lines.join('\n');
}

/** Canvas size (px) that fits the laid-out network. */
function canvasFor(
  events: DecisionEvent[],
  opts: DecisionNetworkOptions
): { width: number; height: number } {
  const rowSpacing = opts.rowSpacing ?? 2.3;
  const colSpacing = opts.colSpacing ?? 5.6;
  const nodeW = opts.nodeWidth ?? 4.6;
  const depths = computeDepths(events);
  const maxDepth = Math.max(0, ...events.map((n) => depths.get(n.id) ?? 0));
  const rowCounts = new Map<number, number>();
  for (const n of events) {
    const d = depths.get(n.id) ?? 0;
    rowCounts.set(d, (rowCounts.get(d) ?? 0) + 1);
  }
  const maxRow = Math.max(1, ...rowCounts.values());
  const width = Math.max(700, Math.round(((maxRow - 1) * colSpacing + nodeW + 4) * 40));
  const height = Math.max(420, Math.round((maxDepth * rowSpacing + 6) * 40));
  return { width, height };
}

/** Render a decision stream directly to SVG via the sovereign SVGCompiler. */
export function renderDecisionSvg(
  events: DecisionEvent[],
  opts: DecisionNetworkOptions = {}
): string {
  const holo = buildDecisionHolo(events, opts);
  const parsed = new HoloCompositionParser().parse(holo);
  if (!parsed.success || !parsed.ast) {
    throw new Error(`decision-network .holo failed to parse: ${JSON.stringify(parsed.errors)}`);
  }
  const { width, height } = canvasFor(events, opts);
  return new SVGCompiler({ width, height }).compile(parsed.ast, '').svg;
}
