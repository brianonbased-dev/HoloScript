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

import React, { useState, useCallback, useMemo } from 'react';
import {
  GitCompare,
  X,
  Copy,
  Eye,
  Code,
  ArrowLeftRight,
  FileText,
} from 'lucide-react';
import type { ViewMode } from './types';
import { SAMPLE_A, SAMPLE_B } from './samples';
import { parseHolo } from './parser';
import { diffCompositions, diffLines } from './engine';
import { TextDiffRow } from './components/TextDiffRow';
import { ObjectDiffCard } from './components/ObjectDiffCard';
import { SourceEditorDrawer } from './components/SourceEditorDrawer';

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

export default HoloDiffPanel;
