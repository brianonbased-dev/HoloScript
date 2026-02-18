/**
 * BundleAnalyzer
 *
 * Top-level bundle analysis entry point.
 * Accepts a map of filePath → content and produces a structured BundleAnalysis
 * that can be rendered as text, JSON, or HTML treemap.
 */

import { createHash } from 'crypto';
import { DuplicateFinder, type DuplicateGroup } from './DuplicateFinder';
import { TreemapGenerator, type TreemapNode } from './TreemapGenerator';

export interface BundleEntry {
  path: string;
  size: number;
  gzipped: number;
  category: string;
  hash: string;
}

export interface CategoryStats {
  count: number;
  size: number;
}

export interface BundleAnalysis {
  /** Total raw size in bytes */
  totalSize: number;
  /** Estimated total gzipped size */
  totalGzipped: number;
  /** Per-file breakdown sorted by size descending */
  entries: BundleEntry[];
  /** Duplicate content groups */
  duplicates: DuplicateGroup[];
  /** Breakdown by category: category → {count, size} */
  byCategory: Record<string, CategoryStats>;
  /** Unix timestamp when analysis ran */
  analyzedAt: number;
}

function inferCategory(filePath: string): string {
  const lower = filePath.toLowerCase();
  if (lower.includes('scene') || lower.includes('world')) return 'scene';
  if (lower.includes('trait')) return 'traits';
  if (lower.includes('runtime') || lower.includes('engine')) return 'runtime';
  if (lower.includes('util') || lower.includes('helper')) return 'utils';
  if (lower.includes('vendor') || lower.includes('node_modules')) return 'vendor';
  if (lower.includes('core') || lower.includes('lib')) return 'core';
  return 'default';
}

/**
 * Rough gzip estimate using character entropy as a proxy.
 * Repetitive content (few distinct chars) compresses very well.
 */
function estimateGzip(content: string, rawSize: number): number {
  if (rawSize === 0) return 0;
  const chars = new Set(content).size;
  // ratio: 1 distinct char → ~10% of raw; 256 distinct → ~90% of raw
  const ratio = Math.max(0.1, Math.min(0.9, chars / 256));
  return Math.ceil(rawSize * ratio);
}

function formatBytes(bytes: number): string {
  if (bytes >= 1_000_000) return `${(bytes / 1_000_000).toFixed(1)} MB`;
  if (bytes >= 1_000) return `${(bytes / 1_000).toFixed(1)} KB`;
  return `${bytes} B`;
}

export class BundleAnalyzer {
  private duplicateFinder = new DuplicateFinder();
  private treemapGenerator = new TreemapGenerator();

  /**
   * Analyse a bundle represented as filePath → content.
   */
  analyze(files: Map<string, string>): BundleAnalysis {
    const entries: BundleEntry[] = [];
    const byCategory: Record<string, CategoryStats> = {};

    for (const [path, content] of files) {
      const size = Buffer.byteLength(content, 'utf8');
      const gzipped = estimateGzip(content, size);
      const category = inferCategory(path);
      const hash = createHash('sha256').update(content, 'utf8').digest('hex').slice(0, 16);

      entries.push({ path, size, gzipped, category, hash });

      if (!byCategory[category]) {
        byCategory[category] = { count: 0, size: 0 };
      }
      byCategory[category].count++;
      byCategory[category].size += size;
    }

    entries.sort((a, b) => b.size - a.size);

    const totalSize = entries.reduce((s, e) => s + e.size, 0);
    const totalGzipped = entries.reduce((s, e) => s + e.gzipped, 0);
    const duplicates = this.duplicateFinder.findExactDuplicates(files);

    return {
      totalSize,
      totalGzipped,
      entries,
      duplicates,
      byCategory,
      analyzedAt: Date.now(),
    };
  }

  /**
   * Format the analysis as a human-readable terminal string.
   */
  formatTerminal(analysis: BundleAnalysis): string {
    const lines: string[] = [];
    lines.push('Bundle Analysis');
    lines.push(`  Total:   ${formatBytes(analysis.totalSize)} raw  /  ${formatBytes(analysis.totalGzipped)} gzip`);
    lines.push(`  Files:   ${analysis.entries.length}`);

    if (analysis.duplicates.length > 0) {
      const wasted = analysis.duplicates.reduce((s, d) => s + d.wastedBytes, 0);
      lines.push(`  Waste:   ${formatBytes(wasted)} from ${analysis.duplicates.length} duplicate group(s)`);
    }

    lines.push('');
    lines.push('By category:');
    for (const [cat, stats] of Object.entries(analysis.byCategory).sort((a, b) => b[1].size - a[1].size)) {
      const pct = analysis.totalSize > 0 ? ((stats.size / analysis.totalSize) * 100).toFixed(1) : '0.0';
      lines.push(`  ${cat.padEnd(10)}  ${formatBytes(stats.size).padStart(10)}  (${pct}%)  ${stats.count} file(s)`);
    }

    lines.push('');
    lines.push('Top 10 files:');
    for (const e of analysis.entries.slice(0, 10)) {
      const pct = analysis.totalSize > 0 ? ((e.size / analysis.totalSize) * 100).toFixed(1) : '0.0';
      lines.push(`  ${e.path.padEnd(50)}  ${formatBytes(e.size).padStart(10)}  (${pct}%)`);
    }

    return lines.join('\n');
  }

  /**
   * Serialize the analysis as pretty-printed JSON.
   */
  formatJSON(analysis: BundleAnalysis): string {
    return JSON.stringify(analysis, null, 2);
  }

  /**
   * Render the analysis as a self-contained HTML treemap page.
   */
  toHTML(analysis: BundleAnalysis, title = 'HoloScript Bundle Analysis'): string {
    const nodes: TreemapNode[] = analysis.entries.map((e) => ({
      name: e.path,
      size: e.size,
      category: e.category,
    }));
    return this.treemapGenerator.generate(nodes, title);
  }
}
