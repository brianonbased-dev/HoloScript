import { createHash } from 'crypto';
import { deflateSync } from 'zlib';
import { DuplicateFinder, type DuplicateGroup } from './DuplicateFinder';
import { TreemapGenerator, type TreemapNode } from './TreemapGenerator';

export interface BundleEntry {
  path: string;
  size: number;
  hash: string;
  category?: string;
}

export interface CategoryStats {
  count: number;
  size: number;
}

export interface BundleAnalysis {
  totalSize: number;
  totalGzipped: number;
  fileCount: number;
  entries: BundleEntry[];
  duplicates: DuplicateGroup[];
  byCategory: Record<string, CategoryStats>;
  analyzedAt: number;
}

function inferCategory(filePath: string): string {
  const lower = filePath.toLowerCase();
  if (lower.includes('scene') || lower.includes('world')) return 'scene';
  if (lower.includes('trait')) return 'traits';
  if (lower.includes('runtime') || lower.includes('engine')) return 'runtime';
  if (lower.includes('util') || lower.includes('helper')) return 'utils';
  if (lower.includes('core') || lower.includes('lib')) return 'core';
  return 'default';
}

function formatBytes(bytes: number): string {
  if (bytes >= 1_000_000) return `${(bytes / 1_000_000).toFixed(1)} MB`;
  if (bytes >= 1_000) return `${(bytes / 1_000).toFixed(1)} KB`;
  return `${bytes} B`;
}

function estimateGzip(content: string): number {
  try {
    return deflateSync(Buffer.from(content, 'utf8'), { level: 6 }).length;
  } catch {
    return Math.round(Buffer.byteLength(content, 'utf8') * 0.4);
  }
}

export class BundleAnalyzer {
  private duplicateFinder = new DuplicateFinder();
  private treemapGenerator = new TreemapGenerator();

  analyze(files: Map<string, string>): BundleAnalysis {
    const entries: BundleEntry[] = [];
    const byCategory: Record<string, CategoryStats> = {};
    let totalGzipped = 0;

    for (const [path, content] of files) {
      const size = Buffer.byteLength(content, 'utf8');
      const hash = createHash('sha256').update(content, 'utf8').digest('hex');
      const category = inferCategory(path);
      entries.push({ path, size, hash, category });

      if (!byCategory[category]) byCategory[category] = { count: 0, size: 0 };
      byCategory[category]!.count++;
      byCategory[category]!.size += size;

      totalGzipped += estimateGzip(content);
    }

    entries.sort((a, b) => b.size - a.size);
    const totalSize = entries.reduce((s, e) => s + e.size, 0);
    const duplicates = this.duplicateFinder.findExactDuplicates(files);

    return { totalSize, totalGzipped, fileCount: entries.length, entries, duplicates, byCategory, analyzedAt: Date.now() };
  }

  formatTerminal(analysis: BundleAnalysis): string {
    const lines: string[] = [];
    lines.push(`Bundle Analysis`);
    lines.push(`  Total:    ${formatBytes(analysis.totalSize)}  (${analysis.fileCount} files)`);
    lines.push(`  Gzipped:  ${formatBytes(analysis.totalGzipped)}`);
    if (analysis.duplicates.length > 0) {
      const wasted = analysis.duplicates.reduce((s, d) => s + d.wastedBytes, 0);
      lines.push(`  Waste:    ${formatBytes(wasted)} from ${analysis.duplicates.length} duplicate group(s)`);
    }
    lines.push('');
    lines.push('By category:');
    for (const [cat, stats] of Object.entries(analysis.byCategory).sort((a, b) => b[1].size - a[1].size)) {
      const pct = analysis.totalSize > 0 ? ((stats.size / analysis.totalSize) * 100).toFixed(1) : '0.0';
      lines.push(`  ${cat.padEnd(10)}  ${formatBytes(stats.size).padStart(10)}  (${pct}%)  [${stats.count} files]`);
    }
    lines.push('');
    lines.push('Top 10 files:');
    for (const e of analysis.entries.slice(0, 10)) {
      const pct = analysis.totalSize > 0 ? ((e.size / analysis.totalSize) * 100).toFixed(1) : '0.0';
      lines.push(`  ${e.path.padEnd(50)}  ${formatBytes(e.size).padStart(10)}  (${pct}%)`);
    }
    return lines.join('\n');
  }

  formatJSON(analysis: BundleAnalysis): string {
    return JSON.stringify(analysis, null, 2);
  }

  toHTML(analysis: BundleAnalysis, title = 'HoloScript Bundle Analysis'): string {
    const nodes: TreemapNode[] = analysis.entries.map((e) => ({
      name: e.path,
      size: e.size,
      category: e.category,
    }));
    return this.treemapGenerator.generate(nodes, title);
  }
}
