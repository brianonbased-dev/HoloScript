import type { IngestPath } from './ingestPath';
import { getIngestPathLabel } from './ingestPath';

export interface IngestComparisonRow {
  plainLabel: string;
  technicalPath: 'marble' | 'holomap';
  contractFingerprint: string;
  ingestMs: number;
  notes?: string;
}

export function formatIngestComparisonMarkdown(
  paperId: string,
  ingestPath: IngestPath,
  rows: IngestComparisonRow[],
): string {
  const lines: string[] = [];
  lines.push(`## Scene ingest report — ${paperId}`);
  lines.push('');
  lines.push(`- **Requested mode:** ${getIngestPathLabel(ingestPath)} (\`${ingestPath}\`)`);
  lines.push('');
  lines.push('| Scene source | Technical | Contract fingerprint | Time (ms) | Notes |');
  lines.push('|--------------|-----------|----------------------|-----------|-------|');
  for (const r of rows) {
    lines.push(
      `| ${r.plainLabel} | \`${r.technicalPath}\` | \`${r.contractFingerprint}\` | ${r.ingestMs.toFixed(3)} | ${r.notes ?? '—'} |`,
    );
  }
  lines.push('');
  lines.push(
    '_Contract fingerprint: compatibility rows hash the canonical paper scene digest; HoloMap rows use the manifest SimulationContract replay fingerprint._',
  );
  lines.push('');
  return lines.join('\n');
}
