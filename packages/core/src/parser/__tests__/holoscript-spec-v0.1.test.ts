/**
 * Parses every fenced example in HoloScript Spec v0.1 with the reader the
 * grammar router names for that fence tag.
 *
 * `hs`, `hsplus`, and `holo` must be accepted.
 * The same tag plus `reject` must be refused.
 */
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { parseHolo } from '../HoloCompositionParser';
import { parse as parseHsplus } from '../HoloScriptPlusParser';

const require = createRequire(import.meta.url);
const wasm = require('../../../../compiler-wasm/pkg-node/holoscript_wasm.js') as {
  validate_detailed: (source: string) => string;
};

const specPath = resolve(
  dirname(fileURLToPath(import.meta.url)),
  '../../../../../docs/spec/holoscript-spec-v0.1.md'
);

type Fence = {
  lang: 'hs' | 'hsplus' | 'holo';
  reject: boolean;
  source: string;
  line: number;
};

function extractFences(markdown: string): Fence[] {
  const fences: Fence[] = [];
  const pattern = /```([^\n]*)\n([\s\S]*?)```/g;
  for (const match of markdown.matchAll(pattern)) {
    const info = (match[1] ?? '').trim();
    const parts = info.split(/\s+/).filter(Boolean);
    const lang = parts[0];
    if (lang !== 'hs' && lang !== 'hsplus' && lang !== 'holo') {
      const line = markdown.slice(0, match.index ?? 0).split('\n').length;
      throw new Error(
        `Spec fence at line ${line} uses "${info || '(no tag)'}". Use hs, hsplus, or holo.`
      );
    }
    const source = (match[2] ?? '').replace(/\n$/, '');
    const line = markdown.slice(0, match.index ?? 0).split('\n').length;
    fences.push({
      lang,
      reject: parts.includes('reject'),
      source,
      line,
    });
  }
  return fences;
}

function accepts(fence: Fence): { ok: boolean; detail: string } {
  if (fence.lang === 'hs') {
    const parsed = JSON.parse(wasm.validate_detailed(fence.source)) as {
      valid?: boolean;
      errors?: Array<{ message?: string }>;
    };
    const detail = (parsed.errors ?? [])
      .map((error) => error.message ?? '')
      .filter(Boolean)
      .join(' | ');
    return { ok: parsed.valid === true, detail };
  }
  if (fence.lang === 'hsplus') {
    const result = parseHsplus(fence.source);
    const detail = result.errors.map((error) => error.message).join(' | ');
    return { ok: result.success, detail };
  }
  const result = parseHolo(fence.source);
  const detail = result.errors.map((error) => error.message).join(' | ');
  return { ok: result.success, detail };
}

describe('HoloScript Spec v0.1 fenced examples', () => {
  const markdown = readFileSync(specPath, 'utf8');
  const fences = extractFences(markdown);

  it('prints the block count and parses every fence with the routed reader', () => {
    const failures: string[] = [];
    for (const fence of fences) {
      const result = accepts(fence);
      const wanted = fence.reject ? 'reject' : 'accept';
      const got = result.ok ? 'accept' : 'reject';
      if ((fence.reject && result.ok) || (!fence.reject && !result.ok)) {
        failures.push(
          `line ${fence.line} ${fence.lang} wanted ${wanted} but got ${got}: ${result.detail || '(no message)'}\n${fence.source}`
        );
      }
    }

    const accepted = fences.filter((fence) => !fence.reject).length;
    const rejected = fences.filter((fence) => fence.reject).length;
    const summary = `spec-v0.1 blocks: ${fences.length} (${accepted} accepted, ${rejected} rejected)`;
    const verdict = `spec-v0.1 result: ${failures.length === 0 ? 'pass' : 'fail'}`;
    process.stdout.write(`${summary}\n${verdict}\n`);

    expect(fences.length, 'the spec must contain fenced examples').toBeGreaterThan(0);
    expect(failures, failures.join('\n\n')).toEqual([]);
  });
});
