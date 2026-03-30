// TARGET: packages/studio/src/components/diff/HoloDiffPanel.tsx
'use client';

/**
 * HoloDiffPanel -- Side-by-side visual diff tool for .holo files.
 *
 * Features:
 *  - .holo parser that extracts composition structure (objects, traits, properties)
 *  - Structural diff engine comparing AST nodes between two versions
 *  - Text diff view (line-by-line) and visual/structural split view
 *  - Color-coded additions, removals, and modifications
 *  - Collapsible object-level diff sections
 *  - Copy merged result to clipboard
 */

import { useState, useCallback, useMemo } from 'react';
import {
  GitCompare,
  X,
  Copy,
  Eye,
  Code,
  ChevronDown,
  ChevronRight,
  ArrowLeftRight,
  FileText,
} from 'lucide-react';

// =============================================================================
// .holo Parser Types
// =============================================================================

interface HoloProp {
  key: string;
  value: string;
  line: number;
}

interface HoloTrait {
  name: string;
  line: number;
}

interface HoloObject {
  name: string;
  traits: HoloTrait[];
  properties: HoloProp[];
  startLine: number;
  endLine: number;
}

interface HoloComposition {
  name: string;
  objects: HoloObject[];
  raw: string;
  lines: string[];
}

// =============================================================================
// .holo Parser
// =============================================================================

function parseHolo(source: string): HoloComposition {
  const lines = source.split('\n');
  const objects: HoloObject[] = [];
  let compositionName = '';

  let currentObject: HoloObject | null = null;
  let depth = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();

    // Match composition name
    const compMatch = line.match(/^composition\s+"([^"]+)"\s*\{/);
    if (compMatch) {
      compositionName = compMatch[1];
      depth++;
      continue;
    }

    // Match object declaration
    const objMatch = line.match(/^object\s+"([^"]+)"\s*\{/);
    if (objMatch) {
      currentObject = {
        name: objMatch[1],
        traits: [],
        properties: [],
        startLine: i,
        endLine: i,
      };
      depth++;
      continue;
    }

    // Match trait (@trait_name)
    if (currentObject && line.startsWith('@')) {
      const traitName = line
        .replace(/^@/, '')
        .replace(/\s*\{.*$/, '')
        .trim();
      currentObject.traits.push({ name: traitName, line: i });
      continue;
    }

    // Match property (key: value)
    const propMatch = line.match(/^(\w[\w-]*)\s*:\s*(.+)/);
    if (currentObject && propMatch) {
      currentObject.properties.push({
        key: propMatch[1],
        value: propMatch[2].replace(/,?\s*$/, ''),
        line: i,
      });
      continue;
    }

    // Track braces
    if (line === '}') {
      depth--;
      if (currentObject && depth <= 1) {
        currentObject.endLine = i;
        objects.push(currentObject);
        currentObject = null;
      }
    }
  }

  return { name: compositionName, objects, raw: source, lines };
}

// =============================================================================
// Structural Diff Engine
// =============================================================================

type DiffStatus = 'added' | 'removed' | 'modified' | 'unchanged';

interface ObjectDiff {
  name: string;
  status: DiffStatus;
  objectA?: HoloObject;
  objectB?: HoloObject;
  traitDiffs: { name: string; status: DiffStatus }[];
  propDiffs: { key: string; status: DiffStatus; valueA?: string; valueB?: string }[];
}

function diffCompositions(a: HoloComposition, b: HoloComposition): ObjectDiff[] {
  const diffs: ObjectDiff[] = [];
  const namesA = new Set(a.objects.map((o) => o.name));
  const namesB = new Set(b.objects.map((o) => o.name));

  // Objects in both
  for (const objA of a.objects) {
    const objB = b.objects.find((o) => o.name === objA.name);
    if (!objB) {
      diffs.push({
        name: objA.name,
        status: 'removed',
        objectA: objA,
        traitDiffs: objA.traits.map((t) => ({ name: t.name, status: 'removed' as DiffStatus })),
        propDiffs: objA.properties.map((p) => ({
          key: p.key,
          status: 'removed' as DiffStatus,
          valueA: p.value,
        })),
      });
      continue;
    }

    // Compare traits
    const traitsA = new Set(objA.traits.map((t) => t.name));
    const traitsB = new Set(objB.traits.map((t) => t.name));
    const traitDiffs: { name: string; status: DiffStatus }[] = [];

    for (const t of traitsA) {
      traitDiffs.push({ name: t, status: traitsB.has(t) ? 'unchanged' : 'removed' });
    }
    for (const t of traitsB) {
      if (!traitsA.has(t)) traitDiffs.push({ name: t, status: 'added' });
    }

    // Compare properties
    const propsA = new Map(objA.properties.map((p) => [p.key, p.value]));
    const propsB = new Map(objB.properties.map((p) => [p.key, p.value]));
    const propDiffs: { key: string; status: DiffStatus; valueA?: string; valueB?: string }[] = [];

    for (const [key, valA] of propsA) {
      const valB = propsB.get(key);
      if (valB === undefined) {
        propDiffs.push({ key, status: 'removed', valueA: valA });
      } else if (valA !== valB) {
        propDiffs.push({ key, status: 'modified', valueA: valA, valueB: valB });
      } else {
        propDiffs.push({ key, status: 'unchanged', valueA: valA, valueB: valB });
      }
    }
    for (const [key, valB] of propsB) {
      if (!propsA.has(key)) {
        propDiffs.push({ key, status: 'added', valueB: valB });
      }
    }

    const hasChanges =
      traitDiffs.some((d) => d.status !== 'unchanged') ||
      propDiffs.some((d) => d.status !== 'unchanged');

    diffs.push({
      name: objA.name,
      status: hasChanges ? 'modified' : 'unchanged',
      objectA: objA,
      objectB: objB,
      traitDiffs,
      propDiffs,
    });
  }

  // Objects only in B
  for (const objB of b.objects) {
    if (!namesA.has(objB.name)) {
      diffs.push({
        name: objB.name,
        status: 'added',
        objectB: objB,
        traitDiffs: objB.traits.map((t) => ({ name: t.name, status: 'added' as DiffStatus })),
        propDiffs: objB.properties.map((p) => ({
          key: p.key,
          status: 'added' as DiffStatus,
          valueB: p.value,
        })),
      });
    }
  }

  return diffs;
}

// =============================================================================
// Line-level Text Diff
// =============================================================================

interface TextDiffLine {
  type: 'added' | 'removed' | 'same';
  text: string;
  lineA?: number;
  lineB?: number;
}

function diffLines(linesA: string[], linesB: string[]): TextDiffLine[] {
  const result: TextDiffLine[] = [];

  // Simple LCS-based diff
  const m = linesA.length;
  const n = linesB.length;
  const dp: number[][] = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0));

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (linesA[i - 1] === linesB[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1] + 1;
      } else {
        dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1]);
      }
    }
  }

  // Backtrack to build diff
  const ops: TextDiffLine[] = [];
  let i = m,
    j = n;
  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && linesA[i - 1] === linesB[j - 1]) {
      ops.push({ type: 'same', text: linesA[i - 1], lineA: i, lineB: j });
      i--;
      j--;
    } else if (j > 0 && (i === 0 || dp[i][j - 1] >= dp[i - 1][j])) {
      ops.push({ type: 'added', text: linesB[j - 1], lineB: j });
      j--;
    } else {
      ops.push({ type: 'removed', text: linesA[i - 1], lineA: i });
      i--;
    }
  }

  return ops.reverse();
}

// =============================================================================
// Default Sample Data
// =============================================================================

const SAMPLE_A = `composition "Dragon Lair" {
  object "Dragon" {
    @grabbable
    @animated

    geometry: "mesh"
    position: [0, 2, -5]
    scale: 1.5
    color: "#ff4400"
  }

  object "TreasureChest" {
    @interactive

    geometry: "box"
    position: [3, 0, -4]
    scale: 0.8
    color: "#ffd700"
  }
}`;

const SAMPLE_B = `composition "Dragon Lair" {
  object "Dragon" {
    @grabbable
    @animated
    @glowing

    geometry: "mesh"
    position: [0, 3, -5]
    scale: 2.0
    color: "#ff6600"
    emissive: "#ff2200"
  }

  object "TreasureChest" {
    @interactive

    geometry: "box"
    position: [3, 0, -4]
    scale: 0.8
    color: "#ffd700"
  }

  object "FirePit" {
    @particles
    @glowing

    geometry: "cylinder"
    position: [-2, 0, -3]
    scale: 0.5
    color: "#ff3300"
  }
}`;

// =============================================================================
// Status Colors & Labels
// =============================================================================

const STATUS_COLOR: Record<DiffStatus, string> = {
  added: 'text-green-400',
  removed: 'text-red-400',
  modified: 'text-amber-400',
  unchanged: 'text-studio-muted',
};

const STATUS_BG: Record<DiffStatus, string> = {
  added: 'bg-green-950/40 border-green-800/40',
  removed: 'bg-red-950/40 border-red-800/40',
  modified: 'bg-amber-950/40 border-amber-800/40',
  unchanged: 'bg-studio-panel border-studio-border',
};

const STATUS_BADGE: Record<DiffStatus, string> = {
  added: 'bg-green-900/60 text-green-300',
  removed: 'bg-red-900/60 text-red-300',
  modified: 'bg-amber-900/60 text-amber-300',
  unchanged: 'bg-studio-panel text-studio-muted',
};

const LINE_BG: Record<string, string> = {
  added: 'bg-green-950/60 border-l-2 border-green-500',
  removed: 'bg-red-950/60 border-l-2 border-red-500',
  same: '',
};

const LINE_COLOR: Record<string, string> = {
  added: 'text-green-300',
  removed: 'text-red-300',
  same: 'text-studio-muted/80',
};

const LINE_PREFIX: Record<string, string> = {
  added: '+',
  removed: '-',
  same: ' ',
};

// =============================================================================
// Sub-components
// =============================================================================

function TextDiffRow({ line }: { line: TextDiffLine }) {
  return (
    <tr className={LINE_BG[line.type]}>
      <td className="select-none w-8 pr-2 text-right font-mono text-[8px] text-studio-muted/40">
        {line.type !== 'added' ? (line.lineA ?? '') : ''}
      </td>
      <td className="select-none w-8 pr-2 text-right font-mono text-[8px] text-studio-muted/40">
        {line.type !== 'removed' ? (line.lineB ?? '') : ''}
      </td>
      <td className={`select-none w-3 font-mono text-[9px] ${LINE_COLOR[line.type]}`}>
        {LINE_PREFIX[line.type]}
      </td>
      <td className={`whitespace-pre font-mono text-[9px] ${LINE_COLOR[line.type]}`}>
        {line.text}
      </td>
    </tr>
  );
}

function ObjectDiffCard({
  diff,
  expanded,
  onToggle,
}: {
  diff: ObjectDiff;
  expanded: boolean;
  onToggle: () => void;
}) {
  const changedCount =
    diff.traitDiffs.filter((d) => d.status !== 'unchanged').length +
    diff.propDiffs.filter((d) => d.status !== 'unchanged').length;

  return (
    <div className={`rounded-lg border ${STATUS_BG[diff.status]} mb-2`}>
      {/* Object header */}
      <button onClick={onToggle} className="flex w-full items-center gap-2 px-3 py-2 text-left">
        {expanded ? (
          <ChevronDown className="h-3 w-3 text-studio-muted flex-shrink-0" />
        ) : (
          <ChevronRight className="h-3 w-3 text-studio-muted flex-shrink-0" />
        )}
        <span className="text-xs font-semibold text-studio-text font-mono">{diff.name}</span>
        <span
          className={`ml-1 rounded-full px-1.5 py-0.5 text-[8px] font-bold uppercase ${STATUS_BADGE[diff.status]}`}
        >
          {diff.status}
        </span>
        {changedCount > 0 && diff.status !== 'added' && diff.status !== 'removed' && (
          <span className="text-[8px] text-studio-muted ml-auto">
            {changedCount} change{changedCount > 1 ? 's' : ''}
          </span>
        )}
      </button>

      {/* Expanded detail */}
      {expanded && (
        <div className="px-3 pb-3 space-y-1.5">
          {/* Traits */}
          {diff.traitDiffs.length > 0 && (
            <div>
              <div className="text-[8px] font-semibold uppercase tracking-wider text-studio-muted mb-1">
                Traits
              </div>
              <div className="flex flex-wrap gap-1">
                {diff.traitDiffs.map((t) => (
                  <span
                    key={t.name}
                    className={`rounded px-1.5 py-0.5 text-[9px] font-mono ${STATUS_BADGE[t.status]}`}
                  >
                    @{t.name}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Properties */}
          {diff.propDiffs.length > 0 && (
            <div>
              <div className="text-[8px] font-semibold uppercase tracking-wider text-studio-muted mb-1">
                Properties
              </div>
              <div className="space-y-0.5">
                {diff.propDiffs.map((p) => (
                  <div
                    key={p.key}
                    className={`flex items-center gap-2 rounded px-2 py-0.5 text-[9px] font-mono ${STATUS_BADGE[p.status]}`}
                  >
                    <span className="font-semibold">{p.key}:</span>
                    {p.status === 'modified' ? (
                      <span>
                        <span className="text-red-300 line-through mr-1">{p.valueA}</span>
                        <span className="text-green-300">{p.valueB}</span>
                      </span>
                    ) : (
                      <span>{p.valueA || p.valueB}</span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// =============================================================================
// Main Component
// =============================================================================

type ViewMode = 'text' | 'visual';

interface HoloDiffPanelProps {
  sourceA?: string;
  sourceB?: string;
  onClose?: () => void;
}

export function HoloDiffPanel({
  sourceA = SAMPLE_A,
  sourceB = SAMPLE_B,
  onClose,
}: HoloDiffPanelProps) {
  const [viewMode, setViewMode] = useState<ViewMode>('visual');
  const [codeA, setCodeA] = useState(sourceA);
  const [codeB, setCodeB] = useState(sourceB);
  const [expandedObjects, setExpandedObjects] = useState<Set<string>>(new Set());
  const [showUnchanged, setShowUnchanged] = useState(true);

  // Parse both versions
  const compA = useMemo(() => parseHolo(codeA), [codeA]);
  const compB = useMemo(() => parseHolo(codeB), [codeB]);

  // Compute diffs
  const structuralDiffs = useMemo(() => diffCompositions(compA, compB), [compA, compB]);
  const textDiffs = useMemo(() => diffLines(compA.lines, compB.lines), [compA, compB]);

  // Stats
  const stats = useMemo(() => {
    const added = structuralDiffs.filter((d) => d.status === 'added').length;
    const removed = structuralDiffs.filter((d) => d.status === 'removed').length;
    const modified = structuralDiffs.filter((d) => d.status === 'modified').length;
    const textAdded = textDiffs.filter((d) => d.type === 'added').length;
    const textRemoved = textDiffs.filter((d) => d.type === 'removed').length;
    return { added, removed, modified, textAdded, textRemoved };
  }, [structuralDiffs, textDiffs]);

  const toggleObject = useCallback((name: string) => {
    setExpandedObjects((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  }, []);

  const expandAll = useCallback(() => {
    setExpandedObjects(new Set(structuralDiffs.map((d) => d.name)));
  }, [structuralDiffs]);

  const collapseAll = useCallback(() => {
    setExpandedObjects(new Set());
  }, []);

  const copyMerged = useCallback(() => {
    navigator.clipboard?.writeText(codeB);
  }, [codeB]);

  const filteredDiffs = showUnchanged
    ? structuralDiffs
    : structuralDiffs.filter((d) => d.status !== 'unchanged');

  return (
    <div className="flex h-full flex-col bg-[#0a0a12] text-studio-text">
      {/* Header */}
      <div className="flex shrink-0 items-center gap-2 border-b border-studio-border bg-studio-panel px-3 py-2.5">
        <GitCompare className="h-4 w-4 text-studio-accent" />
        <span className="text-[12px] font-semibold">.holo Diff</span>

        {/* Stats badges */}
        <div className="ml-2 flex items-center gap-1">
          {stats.added > 0 && (
            <span className="rounded-full bg-green-900/40 px-1.5 py-0.5 text-[8px] text-green-400">
              +{stats.added} obj
            </span>
          )}
          {stats.removed > 0 && (
            <span className="rounded-full bg-red-900/40 px-1.5 py-0.5 text-[8px] text-red-400">
              -{stats.removed} obj
            </span>
          )}
          {stats.modified > 0 && (
            <span className="rounded-full bg-amber-900/40 px-1.5 py-0.5 text-[8px] text-amber-400">
              ~{stats.modified} mod
            </span>
          )}
          <span className="rounded-full bg-green-900/40 px-1.5 py-0.5 text-[8px] text-green-400">
            +{stats.textAdded} lines
          </span>
          <span className="rounded-full bg-red-900/40 px-1.5 py-0.5 text-[8px] text-red-400">
            -{stats.textRemoved} lines
          </span>
        </div>

        {/* View mode toggle */}
        <div className="ml-auto flex items-center gap-1">
          <button
            onClick={() => setViewMode('visual')}
            className={`flex items-center gap-1 rounded px-2 py-1 text-[10px] transition ${
              viewMode === 'visual'
                ? 'bg-studio-accent/20 text-studio-accent'
                : 'text-studio-muted hover:text-studio-text'
            }`}
          >
            <Eye className="h-3 w-3" />
            Visual
          </button>
          <button
            onClick={() => setViewMode('text')}
            className={`flex items-center gap-1 rounded px-2 py-1 text-[10px] transition ${
              viewMode === 'text'
                ? 'bg-studio-accent/20 text-studio-accent'
                : 'text-studio-muted hover:text-studio-text'
            }`}
          >
            <Code className="h-3 w-3" />
            Text
          </button>
        </div>

        {/* Actions */}
        <button
          onClick={copyMerged}
          className="rounded p-1 text-studio-muted hover:text-studio-text"
          title="Copy version B"
        >
          <Copy className="h-3.5 w-3.5" />
        </button>
        {onClose && (
          <button
            onClick={onClose}
            className="rounded p-1 text-studio-muted hover:text-studio-text"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      {/* Composition names */}
      <div className="flex shrink-0 items-center gap-2 border-b border-studio-border bg-studio-panel/50 px-3 py-1.5">
        <FileText className="h-3 w-3 text-red-400" />
        <span className="text-[10px] text-red-400 font-mono">A: {compA.name || '(unnamed)'}</span>
        <ArrowLeftRight className="h-3 w-3 text-studio-muted" />
        <FileText className="h-3 w-3 text-green-400" />
        <span className="text-[10px] text-green-400 font-mono">B: {compB.name || '(unnamed)'}</span>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto">
        {viewMode === 'visual' ? (
          /* ── Visual / Structural View ── */
          <div className="p-3">
            {/* Controls */}
            <div className="flex items-center gap-2 mb-3">
              <button
                onClick={expandAll}
                className="text-[9px] text-studio-muted hover:text-studio-text"
              >
                Expand All
              </button>
              <span className="text-[9px] text-studio-border">|</span>
              <button
                onClick={collapseAll}
                className="text-[9px] text-studio-muted hover:text-studio-text"
              >
                Collapse All
              </button>
              <span className="text-[9px] text-studio-border">|</span>
              <label className="flex items-center gap-1 text-[9px] text-studio-muted cursor-pointer">
                <input
                  type="checkbox"
                  checked={showUnchanged}
                  onChange={(e) => setShowUnchanged(e.target.checked)}
                  className="rounded border-studio-border"
                />
                Show unchanged
              </label>
            </div>

            {/* Object diff cards */}
            {filteredDiffs.length === 0 && (
              <p className="py-8 text-center text-[10px] text-studio-muted">
                No differences found between versions.
              </p>
            )}
            {filteredDiffs.map((diff) => (
              <ObjectDiffCard
                key={diff.name}
                diff={diff}
                expanded={expandedObjects.has(diff.name)}
                onToggle={() => toggleObject(diff.name)}
              />
            ))}
          </div>
        ) : (
          /* ── Text Diff View ── */
          <div>
            {textDiffs.length === 0 && (
              <p className="py-8 text-center text-[10px] text-studio-muted">
                No differences to show.
              </p>
            )}
            {textDiffs.every((d) => d.type === 'same') && textDiffs.length > 0 && (
              <p className="py-4 text-center text-[10px] text-green-500/80">Files are identical</p>
            )}
            <table className="w-full border-collapse">
              <tbody>
                {textDiffs.map((line, i) => (
                  <TextDiffRow key={i} line={line} />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Source editor (collapsed by default, expandable) */}
      <SourceEditorDrawer codeA={codeA} codeB={codeB} onChangeA={setCodeA} onChangeB={setCodeB} />
    </div>
  );
}

// =============================================================================
// Source Editor Drawer (bottom collapsible)
// =============================================================================

function SourceEditorDrawer({
  codeA,
  codeB,
  onChangeA,
  onChangeB,
}: {
  codeA: string;
  codeB: string;
  onChangeA: (v: string) => void;
  onChangeB: (v: string) => void;
}) {
  const [open, setOpen] = useState(false);

  return (
    <div className="border-t border-studio-border">
      <button
        onClick={() => setOpen(!open)}
        className="flex w-full items-center gap-2 px-3 py-1.5 text-[10px] text-studio-muted hover:text-studio-text"
      >
        <ChevronDown className={`h-3 w-3 transition ${open ? 'rotate-180' : ''}`} />
        Edit Sources
      </button>
      {open && (
        <div className="flex gap-2 p-2" style={{ maxHeight: 200 }}>
          <div className="flex-1 flex flex-col gap-1">
            <span className="text-[8px] text-red-400 font-semibold">Version A</span>
            <textarea
              value={codeA}
              onChange={(e) => onChangeA(e.target.value)}
              className="flex-1 resize-none rounded border border-studio-border bg-studio-bg px-2 py-1 text-[9px] font-mono text-studio-text outline-none focus:border-studio-accent"
              spellCheck={false}
            />
          </div>
          <div className="flex-1 flex flex-col gap-1">
            <span className="text-[8px] text-green-400 font-semibold">Version B</span>
            <textarea
              value={codeB}
              onChange={(e) => onChangeB(e.target.value)}
              className="flex-1 resize-none rounded border border-studio-border bg-studio-bg px-2 py-1 text-[9px] font-mono text-studio-text outline-none focus:border-studio-accent"
              spellCheck={false}
            />
          </div>
        </div>
      )}
    </div>
  );
}
