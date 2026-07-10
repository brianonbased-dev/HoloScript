#!/usr/bin/env node
// holo-decision — feed and render the agent decision-network cognition surface.
//
//   holo-decision record --log <f.jsonl> --id <id> --label <text> [--receipt t]
//                        [--status s] [--causes a,b] [--agent claude|codex]
//   holo-decision render --log <f.jsonl> --out <f.svg|f.png> [--title t]
//   holo-decision watch  --log <f.jsonl> --out <f.svg|f.png> [--title t]
//
// A shared JSONL log is the LIVE stream: Claude and Codex both `record` into the same
// file (via this bin or the holoscript pypi client); `watch` re-renders on every append,
// so the thought network draws itself while the agents work. Native (sovereign SVGCompiler),
// receipt-bound, $0 local.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CORE = pathToFileURL(path.resolve(__dirname, '../dist/index.js')).href;

function parseArgs(argv) {
  const a = {};
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i].startsWith('--')) {
      const k = argv[i].slice(2);
      const v = argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[++i] : 'true';
      a[k] = v;
    }
  }
  return a;
}

function readLog(logPath) {
  if (!fs.existsSync(logPath)) return [];
  return fs
    .readFileSync(logPath, 'utf8')
    .split(/\r?\n/)
    .filter((l) => l.trim())
    .map((l, i) => {
      try {
        return JSON.parse(l);
      } catch {
        process.stderr.write(`skip malformed log line ${i + 1}\n`);
        return null;
      }
    })
    .filter(Boolean);
}

async function renderTo(events, outPath, title) {
  const { renderDecisionSvg } = await import(CORE);
  const svg = renderDecisionSvg(events, title ? { title } : {});
  const svgPath = outPath.replace(/\.png$/i, '.svg');
  fs.mkdirSync(path.dirname(path.resolve(svgPath)), { recursive: true });
  fs.writeFileSync(svgPath, svg, 'utf8');
  let pngNote = '';
  if (/\.png$/i.test(outPath)) {
    try {
      const sharp = (await import('sharp')).default;
      await sharp(Buffer.from(svg), { density: 180 }).png().toFile(outPath);
      pngNote = ` + ${path.basename(outPath)}`;
    } catch {
      pngNote = ' (sharp not installed → SVG only)';
    }
  }
  return { svgPath, note: pngNote, nodes: events.length };
}

async function main() {
  const [cmd, ...rest] = process.argv.slice(2);
  const args = parseArgs(rest);

  if (cmd === 'record') {
    if (!args.log || !args.id || !args.label) {
      console.error('record needs --log --id --label');
      process.exit(2);
    }
    const ev = {
      id: args.id,
      label: args.label,
      ...(args.receipt ? { receipt: args.receipt } : {}),
      ...(args.status ? { status: args.status } : {}),
      ...(args.causes ? { causes: args.causes.split(',').map((s) => s.trim()).filter(Boolean) } : {}),
      ...(args.agent ? { agent: args.agent } : {}),
      ...(args.seq ? { seq: Number(args.seq) } : {}),
    };
    fs.mkdirSync(path.dirname(path.resolve(args.log)), { recursive: true });
    fs.appendFileSync(args.log, JSON.stringify(ev) + '\n', 'utf8');
    console.log(`recorded ${ev.id} -> ${args.log}`);
    return;
  }

  if (cmd === 'render') {
    if (!args.log || !args.out) {
      console.error('render needs --log --out');
      process.exit(2);
    }
    const r = await renderTo(readLog(args.log), args.out, args.title);
    console.log(`rendered ${r.nodes} nodes -> ${r.svgPath}${r.note}`);
    return;
  }

  if (cmd === 'watch') {
    if (!args.log || !args.out) {
      console.error('watch needs --log --out');
      process.exit(2);
    }
    const rerender = async () => {
      try {
        const r = await renderTo(readLog(args.log), args.out, args.title);
        console.log(`[watch] ${new Date().toISOString?.() ?? ''} ${r.nodes} nodes -> ${r.svgPath}${r.note}`);
      } catch (e) {
        console.error('[watch] render error:', e.message);
      }
    };
    await rerender();
    let t = null;
    fs.watchFile(args.log, { interval: 500 }, () => {
      clearTimeout(t);
      t = setTimeout(rerender, 150);
    });
    console.log(`[watch] watching ${args.log} — Ctrl-C to stop`);
    return;
  }

  console.error('usage: holo-decision <record|render|watch> --log <f> [...]');
  process.exit(2);
}

main().catch((e) => {
  console.error(e?.stack || e?.message || String(e));
  process.exit(1);
});
