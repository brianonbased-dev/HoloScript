import { DuplicateFinder, type DuplicateGroup } from './DuplicateFinder';
import { TreemapGenerator, type TreemapNode } from './TreemapGenerator';

export interface BundleFile {
  path: string;
  size: number;
  category?: string;
}

export interface BundleReport {
  totalSize: number;
  fileCount: number;
  files: BundleFile[];
  duplicates: DuplicateGroup[];
  wastedBytes: number;
  categories: Record<string, number>;
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

export class BundleAnalyzer {
  private duplicateFinder = new DuplicateFinder();
  private treemapGenerator = new TreemapGenerator();

  analyze(files: Map<string, string>): BundleReport {
    const fileList: BundleFile[] = [];
    const categories: Record<string, number> = {};

    for (const [path, content] of files) {
      const size = Buffer.byteLength(content, 'utf8');
      const category = inferCategory(path);
      fileList.push({ path, size, category });
      categories[category] = (categories[category] ?? 0) + size;
    }

    fileList.sort((a, b) => b.size - a.size);
    const totalSize = fileList.reduce((s, f) => s + f.size, 0);
    const duplicates = this.duplicateFinder.analyze(files);
    const wastedBytes = this.duplicateFinder.wastedBytes(duplicates);

    return { totalSize, fileCount: fileList.length, files: fileList, duplicates, wastedBytes, categories };
  }

  formatConsole(report: BundleReport): string {
    const lines: string[] = [];
    lines.push(`Bundle Analysis`);
    lines.push(`  Total:  ${formatBytes(report.totalSize)}  (${report.fileCount} files)`);
    if (report.wastedBytes > 0) {
      lines.push(`  Waste:  ${formatBytes(report.wastedBytes)} from ${report.duplicates.length} duplicate group(s)`);
    }
    lines.push('');
    lines.push('By category:');
    for (const [cat, size] of Object.entries(report.categories).sort((a, b) => b[1] - a[1])) {
      const pct = report.totalSize > 0 ? ((size / report.totalSize) * 100).toFixed(1) : '0.0';
      lines.push(`  ${cat.padEnd(10)}  ${formatBytes(size).padStart(10)}  (${pct}%)`);
    }
    lines.push('');
    lines.push('Top 10 files:');
    for (const f of report.files.slice(0, 10)) {
      const pct = report.totalSize > 0 ? ((f.size / report.totalSize) * 100).toFixed(1) : '0.0';
      lines.push(`  ${f.path.padEnd(50)}  ${formatBytes(f.size).padStart(10)}  (${pct}%)`);
    }
    if (report.duplicates.length > 0) {
      lines.push('');
      lines.push('Duplicates:');
      for (const g of report.duplicates) {
        lines.push(`  [${formatBytes(g.size)}]  ${g.files.join(', ')}`);
      }
    }
    return lines.join('\n');
  }

  toJSON(report: BundleReport): string {
    return JSON.stringify(report, null, 2);
  }

  toHTML(report: BundleReport, title = 'HoloScript Bundle Analysis'): string {
    const nodes: TreemapNode[] = report.files.map((f) => ({
      name: f.path,
      size: f.size,
      category: f.category,
    }));
    return this.treemapGenerator.generate(nodes, title);
  }
}
