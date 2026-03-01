#!/usr/bin/env node
/**
 * generate-preview-index.js
 *
 * Generates an index.html page that lists all HoloScript 3D preview files.
 * Used by the GitHub Action workflow after generate-preview-html.js creates
 * individual preview HTML files.
 *
 * Usage:
 *   node scripts/generate-preview-index.js <manifest.json> [--pr <number>] [--sha <commit>]
 */

const fs = require('fs');
const path = require('path');

function main() {
  const args = process.argv.slice(2);
  const manifestPath = args.find(a => a.endsWith('.json'));

  if (!manifestPath || !fs.existsSync(manifestPath)) {
    console.error('Error: manifest.json path required');
    process.exit(1);
  }

  const prIdx = args.indexOf('--pr');
  const shaIdx = args.indexOf('--sha');
  const prNum = prIdx !== -1 ? args[prIdx + 1] : '';
  const sha = (shaIdx !== -1 ? args[shaIdx + 1] : '').substring(0, 7);

  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
  const outdir = path.dirname(manifestPath);

  let html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>HoloScript 3D Previews${prNum ? ` - PR #${prNum}` : ''}</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      background: #0d1117; color: #c9d1d9;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      padding: 40px 20px; min-height: 100vh;
    }
    .container { max-width: 900px; margin: 0 auto; }
    h1 { color: #58a6ff; margin-bottom: 8px; font-size: 24px; display: flex; align-items: center; gap: 10px; }
    h1 svg { width: 28px; height: 28px; }
    .subtitle { color: #8b949e; margin-bottom: 32px; font-size: 14px; }
    .card {
      background: #161b22; border: 1px solid #30363d; border-radius: 8px;
      margin-bottom: 16px; overflow: hidden; transition: border-color 0.2s;
    }
    .card:hover { border-color: #58a6ff; }
    .card a {
      display: flex; align-items: center; padding: 16px 20px;
      text-decoration: none; color: inherit; gap: 16px;
    }
    .card .icon {
      width: 48px; height: 48px; border-radius: 10px;
      background: linear-gradient(135deg, #1f6feb, #58a6ff);
      display: flex; align-items: center; justify-content: center; flex-shrink: 0;
    }
    .card .icon svg { width: 24px; height: 24px; color: white; }
    .card .info { flex: 1; }
    .card .name { font-weight: 600; color: #58a6ff; font-size: 15px; }
    .card .meta { font-size: 12px; color: #8b949e; margin-top: 4px; }
    .card .badge {
      background: rgba(88, 166, 255, 0.15); color: #58a6ff;
      padding: 3px 10px; border-radius: 12px; font-size: 12px; font-weight: 500;
    }
    .card .arrow { color: #484f58; font-size: 22px; margin-left: 8px; }
    .footer { margin-top: 40px; text-align: center; font-size: 12px; color: #484f58; }
    .footer a { color: #58a6ff; text-decoration: none; }
    .total {
      background: #161b22; border: 1px solid #30363d; border-radius: 8px;
      padding: 16px 20px; margin-bottom: 24px; text-align: center;
      font-size: 14px; color: #8b949e;
    }
    .total strong { color: #c9d1d9; }
  </style>
</head>
<body>
  <div class="container">
    <h1>
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M12 2L2 7l10 5 10-5-10-5z"/>
        <path d="M2 17l10 5 10-5"/>
        <path d="M2 12l10 5 10-5"/>
      </svg>
      HoloScript 3D Previews
    </h1>
    <p class="subtitle">
      ${prNum ? `PR #${prNum} &middot; ` : ''}${sha ? `${sha} &middot; ` : ''}${manifest.files.length} file(s) &middot; Generated ${new Date().toISOString().split('T')[0]}
    </p>
    <div class="total">
      <strong>${manifest.files.length}</strong> interactive Three.js 3D preview${manifest.files.length !== 1 ? 's' : ''} &middot;
      <strong>${manifest.files.reduce((sum, f) => sum + f.objectCount, 0)}</strong> total objects
    </div>
`;

  for (const f of manifest.files) {
    html += `
    <div class="card">
      <a href="${f.url}">
        <div class="icon">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M12 2L2 7l10 5 10-5-10-5z"/>
            <path d="M2 17l10 5 10-5"/>
            <path d="M2 12l10 5 10-5"/>
          </svg>
        </div>
        <div class="info">
          <div class="name">${f.fileName}</div>
          <div class="meta">${f.objectCount} objects &middot; Click to open interactive 3D preview</div>
        </div>
        <span class="badge">${f.objectCount} obj</span>
        <div class="arrow">&rarr;</div>
      </a>
    </div>
`;
  }

  html += `
    </div>
    <div class="footer">
      Powered by <a href="https://github.com/brianonbased-dev/Holoscript">HoloScript</a> &middot;
      Three.js 3D Preview Engine &middot; Self-contained HTML files
    </div>
  </div>
</body>
</html>`;

  const outputPath = path.join(outdir, 'index.html');
  fs.writeFileSync(outputPath, html);
  console.log(`Generated index: ${outputPath}`);
}

main();
