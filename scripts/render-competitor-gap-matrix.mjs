#!/usr/bin/env node
/**
 * Render competitor-gap-matrix.json to a markdown matrix.
 *
 * Usage:
 *   node scripts/render-competitor-gap-matrix.mjs
 *   node scripts/render-competitor-gap-matrix.mjs --input docs/strategy/competitor-gap-matrix.json --output docs/strategy/competitor-gap-matrix.md
 */
import * as fs from 'fs';
import * as path from 'path';

const inputPath = process.argv.includes('--input')
  ? process.argv[process.argv.indexOf('--input') + 1]
  : path.resolve('docs', 'strategy', 'competitor-gap-matrix.json');

const outputPath = process.argv.includes('--output')
  ? process.argv[process.argv.indexOf('--output') + 1]
  : path.resolve('docs', 'strategy', 'competitor-gap-matrix.md');

const raw = fs.readFileSync(inputPath, 'utf-8');
const data = JSON.parse(raw);

function severityEmoji(sev) {
  if (sev === 'P0') return '🔴';
  if (sev === 'P1') return '🟠';
  if (sev === 'P2') return '🟡';
  if (sev === 'P3') return '🟢';
  return '⚪';
}

function statusBadge(status) {
  const map = {
    watch: '👁️ Watch',
    'in-progress': '🚧 In Progress',
    shipped: '✅ Shipped',
    closed: '🏁 Closed',
  };
  return map[status] || status;
}

let md = `# Competitor Gap Matrix\n\n`;
md += `> Generated: ${data.generatedAt} | Next review: ${data.nextReviewBy}\n\n`;
md += `| ID | Vertical | Competitor | Severity | Direction | Status | Title |\n`;
md += `|---|---|---|---|---|---|---|\n`;

for (const vertical of data.verticals) {
  for (const gap of vertical.gaps) {
    md += `| ${gap.id} | ${vertical.vertical} | ${vertical.competitor} | ${severityEmoji(gap.severity)} ${gap.severity} | ${gap.direction} | ${statusBadge(gap.status)} | ${gap.title} |\n`;
  }
}

md += `\n## Detailed Gap Descriptions\n\n`;

for (const vertical of data.verticals) {
  for (const gap of vertical.gaps) {
    md += `### ${gap.id} — ${gap.title}\n\n`;
    md += `- **Vertical:** ${vertical.vertical}\n`;
    md += `- **Competitor:** ${vertical.competitor}\n`;
    md += `- **Severity:** ${gap.severity}\n`;
    md += `- **Direction:** ${gap.direction}\n`;
    md += `- **Status:** ${gap.status}\n`;
    if (gap.boardTaskId) {
      md += `- **Board Task:** ${gap.boardTaskId}\n`;
    }
    md += `\n**Competitor Advantage:**\n${gap.competitorAdvantage}\n\n`;
    md += `**HoloScript State:**\n${gap.holoscriptState}\n\n`;
    md += `**Needed Response:**\n${gap.neededResponse}\n\n`;
    if (gap.evidence?.length) {
      md += `**Evidence:**\n`;
      for (const ev of gap.evidence) {
        md += `- ${ev}\n`;
      }
      md += `\n`;
    }
    if (gap.sources?.length) {
      md += `**Sources:**\n`;
      for (const src of gap.sources) {
        md += `- ${src}\n`;
      }
      md += `\n`;
    }
  }
}

fs.writeFileSync(outputPath, md, 'utf-8');
console.log(`Rendered ${outputPath} (${data.verticals.length} verticals, ${data.verticals.reduce((n, v) => n + v.gaps.length, 0)} gaps)`);
