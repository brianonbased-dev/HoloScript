#!/usr/bin/env node
// ============================================================================
// check-gold-game-encoding.mjs -- encoding drift guard for the GOLD-game ledger.
//
// The GOLD-game gate ledger (examples/gold-game/GATES.md) and its live runner
// (examples/gold-game/verify-all.mjs) are the single source of truth for gate
// status. They have twice been silently corrupted by a peer toolchain that
// re-encoded them to mojibake (BOM prepended; em-dash U+2014 -> the 3-byte
// sequence rendered "a-EUR"; box-drawing U+2550/U+2500 -> "a-bullet"/"a-quote").
// Mojibake in the ledger is dangerous: it makes the SSOT unreadable and lets a
// corrupt re-encode masquerade as a content change.
//
// This guard enforces, on those exact files:
//   1. No UTF-8 BOM (EF BB BF) at the start.
//   2. Pure 7-bit ASCII content (the files were normalized to ASCII-safe so any
//      non-ASCII byte is, by construction, either re-introduced Unicode or
//      mojibake -- both are rejected).
//   3. No CRLF line endings (matches .gitattributes eol=lf).
//
// Exit 0 = clean. Exit 1 = drift found (prints file:line:col of every offender).
//
//   node scripts/check-gold-game-encoding.mjs
//   pnpm check:gold-game-encoding
// ============================================================================

import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, relative } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, '..');

// The ledger SSOT files this guard protects. Add new gold-game text SSOT here.
const GUARDED = ['examples/gold-game/GATES.md', 'examples/gold-game/verify-all.mjs'];

let failed = 0;

for (const rel of GUARDED) {
  const abs = join(repoRoot, rel);
  if (!existsSync(abs)) {
    console.error(`[gold-game-encoding] MISSING guarded file: ${rel}`);
    failed = 1;
    continue;
  }
  const buf = readFileSync(abs);

  // 1. BOM check (raw bytes).
  if (buf.length >= 3 && buf[0] === 0xef && buf[1] === 0xbb && buf[2] === 0xbf) {
    console.error(
      `${rel}:1:1: UTF-8 BOM (EF BB BF) found -- strip it; the ledger must be BOM-free.`
    );
    failed = 1;
  }

  // 2 + 3. Per-character ASCII + CRLF scan, reported with line:col.
  const text = buf.toString('utf8');
  let line = 1;
  let col = 0;
  const offenders = [];
  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i);
    if (code === 0x0a) {
      line++;
      col = 0;
      continue;
    }
    col++;
    if (code === 0x0d) {
      offenders.push({ line, col, kind: 'CR (CRLF line ending)', ch: '\\r' });
      continue;
    }
    if (code > 0x7f) {
      offenders.push({
        line,
        col,
        kind: `non-ASCII U+${code.toString(16).toUpperCase().padStart(4, '0')}`,
        ch: JSON.stringify(text[i]),
      });
    }
  }
  if (offenders.length) {
    failed = 1;
    const shown = offenders.slice(0, 20);
    for (const o of shown) {
      console.error(`${rel}:${o.line}:${o.col}: ${o.kind} ${o.ch}`);
    }
    if (offenders.length > shown.length) {
      console.error(
        `${rel}: ... and ${offenders.length - shown.length} more (${offenders.length} total)`
      );
    }
  }
}

if (failed) {
  console.error('');
  console.error(
    '[gold-game-encoding] FAIL -- the GOLD-game ledger SSOT must stay BOM-free, pure ASCII, LF.'
  );
  console.error(
    '  This usually means a toolchain re-encoded the files to mojibake (W: peer codex branch, 2026-05-29).'
  );
  console.error(
    '  Fix: re-normalize, e.g. strip BOM + transliterate non-ASCII punctuation back to ASCII,'
  );
  console.error('  keep ONLY the real semantic change, then re-stage.');
  process.exit(1);
}

console.log('[gold-game-encoding] OK -- GATES.md + verify-all.mjs are BOM-free, pure ASCII, LF.');
process.exit(0);
