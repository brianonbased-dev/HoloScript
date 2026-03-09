/**
 * Benchmark HTML Report Generator - Sprint 2
 *
 * Generates a self-contained HTML file with bar charts and trend data.
 */

export interface BenchmarkResult {
  name: string;
  opsPerSecond: number;
  meanMs: number;
  samples: number;
  marginOfError: number;
}

export interface SuiteResults {
  suite: string;
  timestamp: string;
  results: BenchmarkResult[];
}

export interface AllResults {
  version: string;
  commit?: string;
  timestamp: string;
  suites: SuiteResults[];
}

// ---------------------------------------------------------------------------

function barSvg(value: number, max: number, width = 200): string {
  const pct = max === 0 ? 0 : Math.min((value / max) * width, width);
  return (
    `<svg width="${width}" height="14" style="vertical-align:middle">` +
    `<rect width="${pct.toFixed(1)}" height="14" fill="#4caf50" rx="2"/>` +
    `</svg>`
  );
}

function formatOps(ops: number): string {
  if (ops >= 1_000_000) return `${(ops / 1_000_000).toFixed(2)}M ops/s`;
  if (ops >= 1_000) return `${(ops / 1_000).toFixed(1)}K ops/s`;
  return `${ops.toFixed(0)} ops/s`;
}

function buildSuiteTable(suite: SuiteResults): string {
  const maxOps = Math.max(...suite.results.map((r) => r.opsPerSecond), 1);
  const rows = suite.results
    .map(
      (r) => `
    <tr>
      <td style="padding:4px 8px;font-family:monospace">${r.name}</td>
      <td style="padding:4px 8px;text-align:right">${r.meanMs.toFixed(3)}ms</td>
      <td style="padding:4px 8px;text-align:right">${formatOps(r.opsPerSecond)}</td>
      <td style="padding:4px 8px;text-align:right">±${r.marginOfError.toFixed(1)}%</td>
      <td style="padding:4px 8px">${barSvg(r.opsPerSecond, maxOps)}</td>
    </tr>`
    )
    .join('');

  return `
  <div style="margin-bottom:32px">
    <h2 style="font-size:18px;margin:0 0 12px;color:#333">${suite.suite}</h2>
    <table style="border-collapse:collapse;width:100%;background:#fff;border-radius:8px;overflow:hidden;box-shadow:0 1px 4px rgba(0,0,0,.1)">
      <thead>
        <tr style="background:#f5f5f5;font-size:12px;color:#666;text-transform:uppercase">
          <th style="padding:8px;text-align:left">Benchmark</th>
          <th style="padding:8px;text-align:right">Mean</th>
          <th style="padding:8px;text-align:right">Throughput</th>
          <th style="padding:8px;text-align:right">±Error</th>
          <th style="padding:8px;text-align:left">Bar</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>
  </div>`;
}

/**
 * Generate a self-contained HTML benchmark report.
 */
export function generateHtmlReport(results: AllResults): string {
  const suiteHtml = results.suites.map(buildSuiteTable).join('');
  const date = new Date(results.timestamp).toLocaleString();

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>HoloScript Benchmarks — ${date}</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background:#f9f9f9; color:#333; margin:0; padding:24px; }
    .header { margin-bottom:32px; }
    .header h1 { margin:0 0 4px; font-size:24px; }
    .meta { color:#888; font-size:13px; }
  </style>
</head>
<body>
  <div class="header">
    <h1>HoloScript Performance Benchmarks</h1>
    <div class="meta">
      Version ${results.version}${results.commit ? ` · ${results.commit.slice(0, 7)}` : ''} · ${date}
    </div>
  </div>
  ${suiteHtml}
</body>
</html>`;
}

/**
 * Write the HTML report to disk.
 */
export async function writeHtmlReport(results: AllResults, outputPath: string): Promise<void> {
  const { writeFile } = await import('fs/promises');
  const html = generateHtmlReport(results);
  await writeFile(outputPath, html, 'utf-8');
  console.log(`📊 Report written to ${outputPath}`);
}
