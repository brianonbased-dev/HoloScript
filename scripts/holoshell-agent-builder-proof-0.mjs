#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const REPO_ROOT = path.resolve(path.dirname(__filename), '..');
const SCHEMA = 'hololand.holoshell.agent-builder-proof-0.v0.1.0';
const DEFAULT_SOURCE = path.join('apps', 'holoshell', 'source', 'holoshell-agent-builder-proof-0.hsplus');
const DEFAULT_OUTPUT_DIR = path.join('.tmp', 'holoshell', 'agent-builder-proof-0');

function parseArgs(argv = process.argv.slice(2)) {
  const args = {
    source: DEFAULT_SOURCE,
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

    if (arg === '--source') args.source = next();
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

  args.outputDir = resolveRepoPath(args.outputDir);
  args.source = resolveRepoPath(args.source);
  if (!args.receipt) args.receipt = path.join(args.outputDir, 'receipt.json');
  else args.receipt = resolveRepoPath(args.receipt);
  if (!args.html) args.html = path.join(args.outputDir, 'builder-proof.html');
  else args.html = resolveRepoPath(args.html);
  if (!args.js) args.js = path.join(args.outputDir, 'receipt.js');
  else args.js = resolveRepoPath(args.js);
  return args;
}

function usage() {
  return `Usage: node scripts/holoshell-agent-builder-proof-0.mjs [options]

Builds Agent Builder Proof 0 from HoloScript source into a renderable browser
surface plus a receipt. Product semantics live in the .hsplus source; this
script is bridge-only proof machinery.

Options:
  --source <file>        HoloScript source (default: ${DEFAULT_SOURCE})
  --output-dir <dir>     Evidence directory (default: ${DEFAULT_OUTPUT_DIR})
  --receipt <file>       Receipt JSON path
  --html <file>          Render HTML path
  --js <file>            Browser bootstrap JS path
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

function extractQuotedBlockNames(source, keyword) {
  const names = [];
  const regex = new RegExp(`${keyword}\\s+"([^"]+)"`, 'g');
  let match;
  while ((match = regex.exec(source))) names.push(match[1]);
  return names;
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

function validateSource(source, sourcePath) {
  const requiredTokens = [
    'composition "HoloShell Agent Builder Proof 0"',
    'policy "SourcePrecedesBridge"',
    'policy "ValidateBeforeRender"',
    'policy "RuntimeInteractionIsMandatory"',
    'policy "NotR3FCompilerTheatre"',
    'template "AgentBuilderProofReceipt"',
    'action capture_agent_intent',
    'action accept_builder_receipt',
    'action accept_browser_interaction',
    'mcp__holoscript.validate_holoscript',
    'receiptRequired: true',
  ];
  const missing = requiredTokens.filter((token) => !source.includes(token));
  const extension = path.extname(sourcePath);
  const errors = [];
  if (extension !== '.hsplus') errors.push(`expected .hsplus source, got ${extension || '<none>'}`);
  if (!bracesBalanced(source)) errors.push('curly braces are not balanced');
  errors.push(...missing.map((token) => `missing token: ${token}`));

  return {
    status: errors.length ? 'fail' : 'pass',
    tool: 'holoshell-agent-builder-proof-0.local-bridge-guard',
    format: 'hsplus',
    errors,
    warnings: [],
    policies: extractQuotedBlockNames(source, 'policy'),
    templates: extractQuotedBlockNames(source, 'template'),
    actions: Array.from(source.matchAll(/action\s+([A-Za-z0-9_]+)/g)).map((match) => match[1]),
  };
}

function sourceExcerpt(source) {
  return source
    .split(/\r?\n/)
    .slice(0, 80)
    .join('\n')
    .trim();
}

function createReceipt(args) {
  if (!existsSync(args.source)) throw new Error(`Source file not found: ${args.source}`);
  const source = readFileSync(args.source, 'utf8');
  const localValidation = validateSource(source, args.source);
  const mcpValidation = args.mcpStatus
    ? {
        tool: 'mcp__holoscript.validate_holoscript',
        status: args.mcpStatus,
        format: args.mcpFormat || 'unknown',
        summary: args.mcpSummary || '',
      }
    : {
        tool: 'mcp__holoscript.validate_holoscript',
        status: 'not_embedded',
        format: 'hsplus',
        summary: 'Run through the agent MCP surface during hardware validation.',
      };
  const validationStatus = localValidation.status === 'pass' &&
    (!args.mcpStatus || args.mcpStatus === 'pass' || args.mcpStatus === 'valid')
    ? 'pass'
    : 'fail';
  const sourceHash = sha256(source);
  const receipt = {
    schema: SCHEMA,
    status: validationStatus === 'pass' ? 'pass' : 'fail',
    generatedAt: new Date().toISOString(),
    agentIntent: {
      summary: 'Prove an agent can author HoloScript source, validate it, render it, interact with it, and emit receipts in HoloLand.',
      boundedScope: 'Agent Builder Proof 0; not legacy package graph restoration.',
    },
    source: {
      status: 'inspectable',
      path: relativeToRepo(args.source),
      sha256: sourceHash,
      format: 'hsplus',
      excerpt: sourceExcerpt(source),
    },
    validation: {
      status: validationStatus,
      local: localValidation,
      mcp: mcpValidation,
      failureBlocksRenderClaim: true,
    },
    render: {
      status: validationStatus === 'pass' ? 'ready' : 'blocked',
      html: relativeToRepo(args.html),
      js: relativeToRepo(args.js),
      renderer: 'HoloLand browser proof projection generated from HoloScript source',
      generatedSurfaceIsProjectionOnly: true,
    },
    runtime: {
      status: validationStatus === 'pass' ? 'ready' : 'blocked',
      surface: 'local_browser_file_runtime',
      url: pathToFileURL(args.html).href,
      requiredSelector: '#builder-proof-root',
    },
    interaction: {
      status: 'pending_browser_receipt',
      requiredSelector: '#builder-proof-verify',
      expectedDomState: '#interaction-status[data-interacted="true"]',
    },
    proofPath: [
      'agent intent',
      'HoloScript source artifact',
      'HoloScript validation',
      'render projection',
      'browser runtime',
      'interaction receipt',
    ],
    commands: {
      build: 'node scripts/holoshell-agent-builder-proof-0.mjs',
      test: 'node scripts/__tests__/holoshell-agent-builder-proof-0.test.mjs',
      browserReceipt: 'node scripts/holoshell-agent-builder-proof-browser-receipt.mjs',
    },
    receipt: {
      output: relativeToRepo(args.receipt),
      rawSecretsIncluded: false,
      hashInput: 'source.sha256 + validation.status + render.html + runtime.surface',
    },
  };
  receipt.receipt.sha256 = sha256(JSON.stringify({
    source: receipt.source.sha256,
    validation: receipt.validation.status,
    render: receipt.render.html,
    runtime: receipt.runtime.surface,
  }));
  return receipt;
}

function renderHtml(receipt) {
  const embeddedReceipt = JSON.stringify(receipt).replace(/</g, '\\u003c');
  const proofItems = receipt.proofPath
    .map((item, index) => `<li data-step="${index + 1}">${escapeHtml(item)}</li>`)
    .join('\n          ');
  const sourceExcerpt = escapeHtml(receipt.source.excerpt);
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>HoloShell Agent Builder Proof 0</title>
  <style>
    :root {
      color-scheme: dark;
      background: #101316;
      color: #eef2f0;
      font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      min-height: 100vh;
      background:
        radial-gradient(circle at 14% 0%, rgba(33, 121, 108, 0.24), transparent 28rem),
        linear-gradient(135deg, #101316 0%, #14191c 48%, #11161a 100%);
    }
    #builder-proof-root {
      min-height: 100vh;
      display: grid;
      grid-template-columns: minmax(280px, 0.9fr) minmax(320px, 1.1fr);
      gap: 18px;
      padding: clamp(16px, 3vw, 34px);
    }
    main, aside {
      min-width: 0;
      align-self: stretch;
    }
    .surface {
      min-height: 100%;
      border: 1px solid #31413e;
      border-radius: 8px;
      background: rgba(16, 19, 22, 0.82);
      box-shadow: 0 20px 70px rgba(0, 0, 0, 0.24);
    }
    main.surface {
      display: flex;
      flex-direction: column;
      justify-content: space-between;
      gap: 20px;
      padding: clamp(18px, 3vw, 34px);
    }
    aside.surface {
      padding: 16px;
      display: grid;
      gap: 12px;
      align-content: start;
    }
    h1 {
      margin: 0;
      font-size: clamp(30px, 4vw, 58px);
      line-height: 1.02;
      letter-spacing: 0;
      max-width: 12ch;
    }
    h2 {
      margin: 0 0 8px;
      font-size: 15px;
      letter-spacing: 0;
    }
    p {
      margin: 10px 0 0;
      max-width: 68ch;
      color: #b7c4bf;
      line-height: 1.55;
    }
    .status-grid {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 10px;
      margin-top: 18px;
    }
    .metric, .panel {
      border: 1px solid #33423e;
      border-radius: 8px;
      background: #151a1d;
      padding: 12px;
    }
    .metric strong {
      display: block;
      margin-bottom: 5px;
      color: #7dd8c6;
      font-size: 12px;
      text-transform: uppercase;
      letter-spacing: 0.06em;
    }
    .metric span, .panel span {
      overflow-wrap: anywhere;
    }
    #proof-chain {
      margin: 10px 0 0;
      padding-left: 22px;
      color: #dce7e2;
      line-height: 1.75;
    }
    pre {
      max-height: 320px;
      overflow: auto;
      margin: 0;
      padding: 12px;
      border-radius: 8px;
      background: #0c0f11;
      color: #dce7e2;
      font-size: 12px;
      line-height: 1.45;
      white-space: pre-wrap;
      overflow-wrap: anywhere;
    }
    button {
      width: fit-content;
      min-height: 42px;
      border: 0;
      border-radius: 8px;
      padding: 0 16px;
      background: #62d6be;
      color: #08110f;
      font-weight: 760;
      cursor: pointer;
    }
    button:focus-visible {
      outline: 3px solid #f6d365;
      outline-offset: 3px;
    }
    #interaction-status {
      margin-top: 12px;
      color: #f6d365;
      min-height: 24px;
    }
    #interaction-status[data-interacted="true"] {
      color: #7dd8c6;
    }
    @media (max-width: 820px) {
      #builder-proof-root {
        grid-template-columns: minmax(0, 1fr);
      }
      .status-grid {
        grid-template-columns: minmax(0, 1fr);
      }
      h1 {
        max-width: none;
      }
    }
  </style>
</head>
<body data-proof-status="${escapeHtml(receipt.status)}">
  <div id="builder-proof-root" data-source-sha256="${escapeHtml(receipt.source.sha256)}">
    <main class="surface">
      <section>
        <h1>HoloShell Agent Builder Proof 0</h1>
        <p id="agent-intent">${escapeHtml(receipt.agentIntent.summary)}</p>
        <div class="status-grid">
          <div class="metric" id="source-path"><strong>Source</strong><span>${escapeHtml(receipt.source.path)}</span></div>
          <div class="metric" id="validation-status"><strong>Validation</strong><span>${escapeHtml(receipt.validation.status)}</span></div>
          <div class="metric" id="render-output"><strong>Render</strong><span>${escapeHtml(receipt.render.html)}</span></div>
          <div class="metric" id="receipt-output"><strong>Receipt</strong><span>${escapeHtml(receipt.receipt.output)}</span></div>
        </div>
      </section>
      <section>
        <h2>Proof Path</h2>
        <ol id="proof-chain">
          ${proofItems}
        </ol>
      </section>
      <section>
        <button id="builder-proof-verify" type="button">Verify Builder Proof</button>
        <div id="interaction-status" data-interacted="false">Interaction pending</div>
        <pre id="interaction-receipt" aria-live="polite"></pre>
      </section>
    </main>
    <aside class="surface">
      <section class="panel">
        <h2>Source Excerpt</h2>
        <pre id="source-snippet">${sourceExcerpt}</pre>
      </section>
      <section class="panel">
        <h2>Runtime Receipt</h2>
        <pre id="runtime-receipt">${escapeHtml(JSON.stringify({
          schema: receipt.schema,
          status: receipt.status,
          source: receipt.source.path,
          sourceSha256: receipt.source.sha256,
          validation: receipt.validation.status,
          runtime: receipt.runtime.surface,
        }, null, 2))}</pre>
      </section>
    </aside>
  </div>
  <script>
    window.HOLOSHELL_AGENT_BUILDER_PROOF_0 = ${embeddedReceipt};
    document.querySelector('#builder-proof-verify').addEventListener('click', () => {
      const status = document.querySelector('#interaction-status');
      const receipt = {
        schema: 'hololand.holoshell.agent-builder-proof-0.interaction.v0.1.0',
        status: 'pass',
        interactedAt: new Date().toISOString(),
        sourceSha256: window.HOLOSHELL_AGENT_BUILDER_PROOF_0.source.sha256,
        interaction: 'builder-proof-verify-click'
      };
      status.dataset.interacted = 'true';
      status.textContent = 'Interaction receipt captured';
      document.querySelector('#interaction-receipt').textContent = JSON.stringify(receipt, null, 2);
      window.HOLOSHELL_AGENT_BUILDER_PROOF_0_INTERACTION = receipt;
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
    `window.HOLOSHELL_AGENT_BUILDER_PROOF_0_RECEIPT = ${JSON.stringify(receipt, null, 2)};\n`,
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
          `HoloShell agent builder proof 0: ${receipt.status}`,
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
