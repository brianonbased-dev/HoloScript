#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const REPO_ROOT = path.resolve(path.dirname(__filename), '..');
const SCHEMA = 'hololand.enterprise-package-gate.receipt.v0.1.0';
const DEFAULT_GATE_DIR = path.join('apps', 'holoshell', 'enterprise-gates', 'customer-success-room');
const DEFAULT_OUTPUT_DIR = path.join('.tmp', 'hololand', 'enterprise-gates', 'customer-success-room');

function parseArgs(argv = process.argv.slice(2)) {
  const args = {
    gateDir: DEFAULT_GATE_DIR,
    manifest: '',
    source: '',
    outputDir: DEFAULT_OUTPUT_DIR,
    receipt: '',
    html: '',
    js: '',
    mcpStatus: '',
    mcpFormat: '',
    mcpSummary: '',
    json: false,
    help: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const next = () => {
      index += 1;
      if (index >= argv.length) throw new Error(`Missing value for ${arg}`);
      return argv[index];
    };

    if (arg === '--gate-dir') args.gateDir = next();
    else if (arg === '--manifest') args.manifest = next();
    else if (arg === '--source') args.source = next();
    else if (arg === '--output-dir') args.outputDir = next();
    else if (arg === '--receipt') args.receipt = next();
    else if (arg === '--html') args.html = next();
    else if (arg === '--js') args.js = next();
    else if (arg === '--mcp-status') args.mcpStatus = next();
    else if (arg === '--mcp-format') args.mcpFormat = next();
    else if (arg === '--mcp-summary') args.mcpSummary = next();
    else if (arg === '--json') args.json = true;
    else if (arg === '--help' || arg === '-h') args.help = true;
    else throw new Error(`Unknown option: ${arg}`);
  }

  args.gateDir = resolveRepoPath(args.gateDir);
  if (!args.manifest) args.manifest = path.join(args.gateDir, 'package-gate.json');
  else args.manifest = resolveRepoPath(args.manifest);
  args.outputDir = resolveRepoPath(args.outputDir);
  if (!args.receipt) args.receipt = path.join(args.outputDir, 'receipt.json');
  else args.receipt = resolveRepoPath(args.receipt);
  if (!args.html) args.html = path.join(args.outputDir, 'gate.html');
  else args.html = resolveRepoPath(args.html);
  if (!args.js) args.js = path.join(args.outputDir, 'gate-receipt.js');
  else args.js = resolveRepoPath(args.js);
  return args;
}

function usage() {
  return `Usage: node scripts/hololand-enterprise-package-gate.mjs [options]

Builds a HoloLand enterprise package gate fixture from HoloScript source and a
package-gate manifest. The output is a receipt and a renderable HTML projection.

Options:
  --gate-dir <dir>       Gate directory (default: ${DEFAULT_GATE_DIR})
  --manifest <file>      Gate manifest JSON
  --source <file>        HoloScript source override
  --output-dir <dir>     Evidence directory (default: ${DEFAULT_OUTPUT_DIR})
  --receipt <file>       Receipt JSON path
  --html <file>          Render HTML path
  --js <file>            Receipt bootstrap JS path
  --mcp-status <status>  Optional mcp__holoscript.validate_holoscript status
  --mcp-format <format>  Optional MCP validator format
  --mcp-summary <text>   Optional MCP validator summary
  --json                 Print receipt JSON
  -h, --help             Show this help
`;
}

function resolveRepoPath(filePath) {
  return path.isAbsolute(filePath) ? path.normalize(filePath) : path.resolve(REPO_ROOT, filePath);
}

function relativeToRepo(filePath) {
  return path.relative(REPO_ROOT, filePath).replace(/\\/g, '/');
}

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (char) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  }[char]));
}

function readJson(filePath) {
  return JSON.parse(readFileSync(filePath, 'utf8'));
}

function bracesBalanced(source) {
  let depth = 0;
  for (const char of source) {
    if (char === '{') depth += 1;
    else if (char === '}') depth -= 1;
    if (depth < 0) return false;
  }
  return depth === 0;
}

function extractQuotedBlockNames(source, keyword) {
  const names = [];
  const regex = new RegExp(`${keyword}\\s+"([^"]+)"`, 'g');
  let match;
  while ((match = regex.exec(source))) names.push(match[1]);
  return names;
}

function requireArrayIncludes(errors, array, field, requiredValues) {
  if (!Array.isArray(array)) {
    errors.push(`${field} must be an array`);
    return;
  }
  for (const value of requiredValues) {
    if (!array.includes(value)) errors.push(`${field} missing ${value}`);
  }
}

function hasText(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function validateManifest(manifest, sourcePath) {
  const errors = [];
  if (manifest.schema !== 'hololand.enterprise-package-gate.v0.1.0') errors.push('manifest schema mismatch');
  if (!hasText(manifest.id)) errors.push('manifest id is required');
  if (!hasText(manifest.title)) errors.push('manifest title is required');
  if (!hasText(manifest.vertical)) errors.push('manifest vertical is required');
  if (manifest.packageClass !== 'enterprise_business_solution') errors.push('manifest packageClass must be enterprise_business_solution');
  if (manifest.developerPackageSurface !== false) errors.push('developerPackageSurface must be false');
  if (manifest.humanUserSurface !== 'deployed_hololand_room') errors.push('humanUserSurface must be deployed_hololand_room');
  if (manifest.sourcePath !== relativeToRepo(sourcePath)) errors.push(`manifest sourcePath mismatch: ${manifest.sourcePath}`);
  if (!manifest.businessWorkflow?.id) errors.push('businessWorkflow.id is required');
  if (!Array.isArray(manifest.businessWorkflow?.actors) || manifest.businessWorkflow.actors.length < 1) {
    errors.push('businessWorkflow.actors must name at least one actor');
  }
  if (!Array.isArray(manifest.businessWorkflow?.criticalPath) || manifest.businessWorkflow.criticalPath.length < 2) {
    errors.push('businessWorkflow.criticalPath must name at least two steps');
  }
  if (!Array.isArray(manifest.holoscriptPackages) || manifest.holoscriptPackages.length < 3) {
    errors.push('holoscriptPackages must name at least three consumed upstream packages');
  } else {
    for (const pkg of manifest.holoscriptPackages) {
      if (!hasText(pkg.name) || !pkg.name.startsWith('@holoscript/')) {
        errors.push(`holoscript package ${pkg.name || '<unknown>'} must use @holoscript/*`);
      }
      if (!Array.isArray(pkg.gates) || pkg.gates.length < 1) {
        errors.push(`holoscript package ${pkg.name || '<unknown>'} must name at least one gate`);
      }
    }
  }
  if (!Array.isArray(manifest.benchmarkGates) || manifest.benchmarkGates.length < 1) {
    errors.push('benchmarkGates must contain at least one gate');
  } else {
    for (const gate of manifest.benchmarkGates) {
      if (!hasText(gate.id)) errors.push('benchmarkGates.id is required');
      if (!Array.isArray(gate.mustProve) || gate.mustProve.length < 1) {
        errors.push(`benchmark gate ${gate.id || '<unknown>'} must name proof obligations`);
      }
    }
  }
  requireArrayIncludes(errors, manifest.requiredReceipts, 'requiredReceipts', [
    'source',
    'validation',
    'runtime',
    'render',
    'interaction',
    'hardware_browser',
  ]);
  if (!Array.isArray(manifest.upstreamGaps) || manifest.upstreamGaps.length < 1) {
    errors.push('upstreamGaps must record at least one HoloScript-owned gap');
  } else {
    for (const gap of manifest.upstreamGaps) {
      if (gap.owner !== 'HoloScript') errors.push(`upstream gap ${gap.id || '<unknown>'} owner must be HoloScript`);
      if (gap.localRewriteAllowed !== false) {
        errors.push(`upstream gap ${gap.id || '<unknown>'} must block local rewrites`);
      }
    }
  }
  if (!manifest.promotion?.requires?.some((item) => String(item).includes('mcp__holoscript.validate_holoscript'))) {
    errors.push('promotion.requires must include mcp__holoscript.validate_holoscript');
  }
  if (manifest.legacyExample) {
    if (manifest.legacyExample.status !== 'archive_watch') {
      errors.push('legacyExample.status must be archive_watch');
    }
    if (!hasText(manifest.legacyExample.path)) errors.push('legacyExample.path is required');
    if (!hasText(manifest.legacyExample.replacementGate)) errors.push('legacyExample.replacementGate is required');
  }
  return errors;
}

function validateSource(source, sourcePath, manifest) {
  const requiredTokens = [
    'composition "HoloLand Enterprise Package Gate:',
    `gateId: "${manifest.id}"`,
    `packageClass: "${manifest.packageClass}"`,
    `businessWorkflow: "${manifest.businessWorkflow.id}"`,
    'developerPackageSurface: false',
    'template "EnterprisePackageGateReceipt"',
    'policy "EnterprisePackagesAreGates"',
    'policy "SourceReceiptsBlockPromotion"',
    'policy "UpstreamGapsDoNotBecomeLocalRewrites"',
    'action accept_enterprise_gate_receipt',
    'action record_upstream_gap',
    'mcp__holoscript.validate_holoscript',
    'receiptRequired: true',
  ];
  const errors = [];
  const extension = path.extname(sourcePath);
  if (extension !== '.hsplus') errors.push(`expected .hsplus source, got ${extension || '<none>'}`);
  if (!bracesBalanced(source)) errors.push('curly braces are not balanced');
  for (const token of requiredTokens) {
    if (!source.includes(token)) errors.push(`missing token: ${token}`);
  }
  if (!source.includes(manifest.title)) errors.push(`missing title token: ${manifest.title}`);
  if (!source.includes(`sourcePath: "${manifest.sourcePath}"`)) {
    errors.push(`missing sourcePath token: ${manifest.sourcePath}`);
  }
  for (const gate of manifest.benchmarkGates || []) {
    if (!source.includes(`benchmarkGate: "${gate.id}"`)) {
      errors.push(`missing benchmark gate token: ${gate.id}`);
    }
  }
  const actions = Array.from(source.matchAll(/action\s+([A-Za-z0-9_]+)/g)).map((match) => match[1]);
  if (!actions.some((action) => action.startsWith('capture_'))) {
    errors.push('missing capture_* action for business intent intake');
  }
  return {
    status: errors.length ? 'fail' : 'pass',
    tool: 'hololand-enterprise-package-gate.local-bridge-guard',
    format: 'hsplus',
    errors,
    warnings: [],
    policies: extractQuotedBlockNames(source, 'policy'),
    templates: extractQuotedBlockNames(source, 'template'),
    actions,
  };
}

function sourceExcerpt(source) {
  return source
    .split(/\r?\n/)
    .slice(0, 90)
    .join('\n')
    .trim();
}

function statusFromMcp(args) {
  if (!args.mcpStatus) {
    return {
      tool: 'mcp__holoscript.validate_holoscript',
      status: 'not_embedded',
      format: 'hsplus',
      summary: 'Run through the agent MCP surface during promotion validation.',
    };
  }
  return {
    tool: 'mcp__holoscript.validate_holoscript',
    status: args.mcpStatus,
    format: args.mcpFormat || 'unknown',
    summary: args.mcpSummary || '',
  };
}

function createReceipt(args) {
  if (!existsSync(args.manifest)) throw new Error(`Gate manifest not found: ${args.manifest}`);
  const manifest = readJson(args.manifest);
  const sourcePath = args.source ? resolveRepoPath(args.source) : resolveRepoPath(manifest.sourcePath);
  if (!existsSync(sourcePath)) throw new Error(`Source file not found: ${sourcePath}`);
  const source = readFileSync(sourcePath, 'utf8');
  const sourceValidation = validateSource(source, sourcePath, manifest);
  const manifestErrors = validateManifest(manifest, sourcePath);
  const localStatus = sourceValidation.status === 'pass' && manifestErrors.length === 0 ? 'pass' : 'fail';
  const mcpValidation = statusFromMcp(args);
  const validationStatus = localStatus === 'pass' &&
    (!args.mcpStatus || args.mcpStatus === 'pass' || args.mcpStatus === 'valid')
    ? 'pass'
    : 'fail';
  const sourceHash = sha256(source);
  const manifestHash = sha256(JSON.stringify(manifest));
  const upstreamGapCount = manifest.upstreamGaps.length;
  const receipt = {
    schema: SCHEMA,
    status: validationStatus === 'pass' ? 'pass' : 'fail',
    generatedAt: new Date().toISOString(),
    gate: {
      id: manifest.id,
      title: manifest.title,
      vertical: manifest.vertical,
      packageClass: manifest.packageClass,
      humanUserSurface: manifest.humanUserSurface,
      developerPackageSurface: manifest.developerPackageSurface,
      manifest: relativeToRepo(args.manifest),
      manifestSha256: manifestHash,
    },
    businessWorkflow: manifest.businessWorkflow,
    source: {
      status: 'inspectable',
      path: relativeToRepo(sourcePath),
      sha256: sourceHash,
      format: 'hsplus',
      excerpt: sourceExcerpt(source),
    },
    holoscriptPackages: manifest.holoscriptPackages,
    benchmarkGates: manifest.benchmarkGates,
    validation: {
      status: validationStatus,
      local: {
        status: localStatus,
        source: sourceValidation,
        manifest: {
          status: manifestErrors.length ? 'fail' : 'pass',
          errors: manifestErrors,
        },
      },
      mcp: mcpValidation,
      failureBlocksPromotion: true,
    },
    runtime: {
      status: validationStatus === 'pass' ? 'ready' : 'blocked',
      surface: 'local_browser_file_runtime',
      url: pathToFileURL(args.html).href,
      requiredSelector: '#enterprise-gate-root',
    },
    render: {
      status: validationStatus === 'pass' ? 'ready' : 'blocked',
      html: relativeToRepo(args.html),
      js: relativeToRepo(args.js),
      renderer: 'HoloLand enterprise gate projection generated from HoloScript source and gate manifest',
      generatedSurfaceIsProjectionOnly: true,
    },
    interaction: {
      status: 'pending_browser_receipt',
      requiredSelector: '#enterprise-gate-verify',
      expectedDomState: '#enterprise-interaction-status[data-interacted="true"]',
    },
    hardwareBrowser: {
      status: 'required_for_promotion',
      minimumEvidence: [
        'browser receipt',
        'screenshot hash',
        'DOM hash',
        'interaction captured',
      ],
    },
    requiredReceipts: manifest.requiredReceipts,
    promotion: manifest.promotion,
    upstreamGaps: {
      status: upstreamGapCount ? 'recorded' : 'clear',
      count: upstreamGapCount,
      items: manifest.upstreamGaps,
    },
    legacyExample: manifest.legacyExample || null,
    commands: {
      build: 'node scripts/hololand-enterprise-package-gate.mjs',
      browserReceipt: 'node scripts/hololand-enterprise-package-gate-browser-receipt.mjs',
      test: 'node scripts/__tests__/hololand-enterprise-package-gate.test.mjs',
      mcpValidation: 'mcp__holoscript.validate_holoscript',
    },
    receipt: {
      output: relativeToRepo(args.receipt),
      rawSecretsIncluded: false,
      hashInput: 'source.sha256 + manifest.sha256 + validation.status + gate.id',
    },
  };
  receipt.receipt.sha256 = sha256(JSON.stringify({
    source: receipt.source.sha256,
    manifest: receipt.gate.manifestSha256,
    validation: receipt.validation.status,
    gate: receipt.gate.id,
  }));
  return receipt;
}

function renderHtml(receipt) {
  const embeddedReceipt = JSON.stringify(receipt).replace(/</g, '\\u003c');
  const gates = receipt.benchmarkGates
    .map((gate) => `<li><strong>${escapeHtml(gate.id)}</strong><span>${escapeHtml(gate.description)}</span></li>`)
    .join('\n          ');
  const packages = receipt.holoscriptPackages
    .map((pkg) => `<li><strong>${escapeHtml(pkg.name)}</strong><span>${escapeHtml(pkg.gates.join(', '))}</span></li>`)
    .join('\n          ');
  const requiredReceipts = receipt.requiredReceipts
    .map((item) => `<li>${escapeHtml(item)}</li>`)
    .join('\n          ');
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtml(receipt.gate.title)} Enterprise Package Gate</title>
  <style>
    :root {
      color-scheme: dark;
      background: #0f1412;
      color: #eef2f0;
      font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    }
    * { box-sizing: border-box; }
    body { margin: 0; min-height: 100vh; background: #0f1412; }
    #enterprise-gate-root {
      min-height: 100vh;
      display: grid;
      grid-template-columns: minmax(280px, 0.8fr) minmax(320px, 1.2fr);
      gap: 18px;
      padding: clamp(16px, 3vw, 34px);
    }
    main, aside {
      min-width: 0;
      border: 1px solid #31413e;
      border-radius: 8px;
      background: #151a1d;
      padding: clamp(16px, 2vw, 26px);
    }
    h1 {
      margin: 0;
      font-size: clamp(30px, 4vw, 54px);
      line-height: 1.03;
      letter-spacing: 0;
    }
    h2 {
      margin: 22px 0 8px;
      font-size: 15px;
      letter-spacing: 0;
    }
    p, li, span {
      color: #c3d0ca;
      line-height: 1.55;
    }
    ul { padding-left: 20px; }
    li strong {
      display: block;
      color: #79d6c1;
    }
    .metric-grid {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 10px;
      margin-top: 18px;
    }
    .metric {
      border: 1px solid #33423e;
      border-radius: 8px;
      background: #0f1412;
      padding: 12px;
      overflow-wrap: anywhere;
    }
    .metric strong {
      display: block;
      margin-bottom: 5px;
      color: #79d6c1;
      font-size: 12px;
      text-transform: uppercase;
      letter-spacing: 0.06em;
    }
    pre {
      max-height: 360px;
      overflow: auto;
      margin: 0;
      padding: 12px;
      border-radius: 8px;
      background: #0a0d0c;
      color: #dce7e2;
      font-size: 12px;
      line-height: 1.45;
      white-space: pre-wrap;
      overflow-wrap: anywhere;
    }
    button {
      min-height: 42px;
      border: 0;
      border-radius: 8px;
      padding: 0 16px;
      background: #79d6c1;
      color: #08110f;
      font-weight: 760;
      cursor: pointer;
    }
    #enterprise-interaction-status {
      margin-top: 12px;
      min-height: 24px;
      color: #f2cf66;
    }
    #enterprise-interaction-status[data-interacted="true"] { color: #79d6c1; }
    @media (max-width: 820px) {
      #enterprise-gate-root { grid-template-columns: minmax(0, 1fr); }
      .metric-grid { grid-template-columns: minmax(0, 1fr); }
    }
  </style>
</head>
<body data-gate-status="${escapeHtml(receipt.status)}">
  <div id="enterprise-gate-root" data-source-sha256="${escapeHtml(receipt.source.sha256)}">
    <main>
      <h1>${escapeHtml(receipt.gate.title)}</h1>
      <p id="business-workflow">${escapeHtml(receipt.businessWorkflow.summary)}</p>
      <div class="metric-grid">
        <div class="metric" id="gate-source"><strong>Source</strong>${escapeHtml(receipt.source.path)}</div>
        <div class="metric" id="gate-validation"><strong>Validation</strong>${escapeHtml(receipt.validation.status)}</div>
        <div class="metric" id="gate-render"><strong>Render</strong>${escapeHtml(receipt.render.html)}</div>
        <div class="metric" id="gate-promotion"><strong>Promotion</strong>${escapeHtml(receipt.promotion.status)}</div>
      </div>
      <h2>Benchmark Gates</h2>
      <ul id="benchmark-gates">
        ${gates}
      </ul>
      <h2>Required Receipts</h2>
      <ul id="required-receipts">
        ${requiredReceipts}
      </ul>
      <button id="enterprise-gate-verify" type="button">Verify Enterprise Gate</button>
      <div id="enterprise-interaction-status" data-interacted="false">Interaction receipt pending</div>
      <pre id="enterprise-interaction-receipt" aria-live="polite"></pre>
    </main>
    <aside>
      <h2>Consumed HoloScript Packages</h2>
      <ul id="holoscript-packages">
        ${packages}
      </ul>
      <h2>Gate Receipt</h2>
      <pre id="enterprise-gate-receipt">${escapeHtml(JSON.stringify({
        schema: receipt.schema,
        gate: receipt.gate.id,
        status: receipt.status,
        source: receipt.source.path,
        sourceSha256: receipt.source.sha256,
        validation: receipt.validation.status,
        upstreamGapStatus: receipt.upstreamGaps.status,
        legacyExampleStatus: receipt.legacyExample?.status || null,
        legacyExamplePath: receipt.legacyExample?.path || null,
      }, null, 2))}</pre>
    </aside>
  </div>
  <script>
    window.HOLOLAND_ENTERPRISE_PACKAGE_GATE = ${embeddedReceipt};
    document.querySelector('#enterprise-gate-verify').addEventListener('click', () => {
      const status = document.querySelector('#enterprise-interaction-status');
      const receipt = {
        schema: 'hololand.enterprise-package-gate.interaction.v0.1.0',
        status: 'pass',
        gate: window.HOLOLAND_ENTERPRISE_PACKAGE_GATE.gate.id,
        interactedAt: new Date().toISOString(),
        sourceSha256: window.HOLOLAND_ENTERPRISE_PACKAGE_GATE.source.sha256,
        interaction: 'enterprise-gate-verify-click'
      };
      status.dataset.interacted = 'true';
      status.textContent = 'Interaction receipt captured';
      document.querySelector('#enterprise-interaction-receipt').textContent = JSON.stringify(receipt, null, 2);
      window.HOLOLAND_ENTERPRISE_PACKAGE_GATE_INTERACTION = receipt;
    });
  </script>
</body>
</html>
`;
}

function writeOutputs(args, receipt) {
  mkdirSync(args.outputDir, { recursive: true });
  writeFileSync(args.html, renderHtml(receipt), 'utf8');
  writeFileSync(args.receipt, `${JSON.stringify(receipt, null, 2)}\n`, 'utf8');
  writeFileSync(
    args.js,
    `window.HOLOLAND_ENTERPRISE_PACKAGE_GATE_RECEIPT = ${JSON.stringify(receipt, null, 2)};\n`,
    'utf8',
  );
}

function main() {
  try {
    const args = parseArgs();
    if (args.help) {
      process.stdout.write(usage());
      return;
    }
    const receipt = createReceipt(args);
    writeOutputs(args, receipt);
    if (args.json) {
      process.stdout.write(`${JSON.stringify(receipt, null, 2)}\n`);
    } else {
      process.stdout.write(
        [
          `HoloLand enterprise package gate: ${receipt.status}`,
          `gate: ${receipt.gate.id}`,
          `source: ${receipt.source.path}`,
          `html: ${receipt.render.html}`,
          `receipt: ${receipt.receipt.output}`,
        ].join('\n') + '\n',
      );
    }
    if (receipt.status !== 'pass') process.exitCode = 1;
  } catch (error) {
    process.stderr.write(`${error.stack || error.message}\n`);
    process.exitCode = 1;
  }
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
