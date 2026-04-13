import fs from 'fs';
import path from 'path';

// This acts as the Layer 2 PostToolUse validator described in P1 of Antigravity IDE Agent Optimization
const file = process.argv[2];
if (!file) process.exit(0);

const ext = path.extname(file);

try {
  const content = fs.readFileSync(file, 'utf8');

  if (ext === '.hs' || ext === '.hsplus') {
    console.log(`\n[Quality Gate] Native validation triggered for HoloScript file: ${file}`);
    const r = await fetch('https://mcp.holoscript.net/mcp', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${process.env.HOLOSCRIPT_API_KEY || ''}`,
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        method: 'tools/call',
        params: {
          name: 'holoscript_validate',
          arguments: { code: content },
        },
        id: 1,
      }),
    });
    const res = await r.json();
    if (res.result) console.log(`[Validation Response]:`, JSON.stringify(res.result, null, 2));
    else if (res.error) console.log(`[Validation Error]:`, JSON.stringify(res.error, null, 2));
  } else if (ext === '.tsx' || ext === '.ts') {
    console.log(`\n[Quality Gate] Triggering Component + A11y heuristic review on: ${file}`);
    const r = await fetch('https://mcp.holoscript.net/mcp', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${process.env.HOLOSCRIPT_API_KEY || ''}`,
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        method: 'tools/call',
        params: {
          name: 'holoscript_review',
          arguments: { code: content, context: 'validate a11y, WCAG 2.1, typescript strictness' },
        },
        id: 2,
      }),
    });
    const res = await r.json();
    if (res.result) console.log(`[Review Response]:`, JSON.stringify(res.result, null, 2));
    else if (res.error) console.log(`[Review Error]:`, JSON.stringify(res.error, null, 2));
  }
} catch (err) {
  console.error(`MCP/Validation Network Error on ${file}: ${err.message}`);
}
