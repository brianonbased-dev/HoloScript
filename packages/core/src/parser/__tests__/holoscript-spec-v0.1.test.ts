/**
 * Parses every fenced example in HoloScript Spec v0.1 with the reader the
 * grammar router names for that fence tag.
 *
 * `hs`, `hsplus`, and `holo` must be accepted.
 * The same tag plus `reject` must be refused.
 *
 * Fence info strings must be exactly one of:
 * `hs`, `hsplus`, `holo`, `hs reject`, `hsplus reject`, `holo reject`.
 * A tilde fence, an empty body, or any other info string fails the extractor.
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

const ALLOWED_FENCE_INFO = new Set([
  'hs',
  'hsplus',
  'holo',
  'hs reject',
  'hsplus reject',
  'holo reject',
]);

type Fence = {
  lang: 'hs' | 'hsplus' | 'holo';
  reject: boolean;
  source: string;
  line: number;
};

type ExtractedFences = {
  fences: Fence[];
  errors: string[];
};

function lineNumberAt(markdown: string, index: number): number {
  return markdown.slice(0, index).split('\n').length;
}

function extractFences(markdown: string): ExtractedFences {
  const fences: Fence[] = [];
  const errors: string[] = [];

  const lines = markdown.split('\n');
  for (let i = 0; i < lines.length; i++) {
    if (/^\s*~~~/.test(lines[i] ?? '')) {
      errors.push(`line ${i + 1}: tilde fence is not allowed`);
    }
  }

  const pattern = /```([^\n]*)\n([\s\S]*?)```/g;
  for (const match of markdown.matchAll(pattern)) {
    const info = (match[1] ?? '').trim();
    const line = lineNumberAt(markdown, match.index ?? 0);
    const source = (match[2] ?? '').replace(/\n$/, '');
    if (!ALLOWED_FENCE_INFO.has(info)) {
      errors.push(`line ${line}: fence info string "${info || '(no tag)'}" is not allowed`);
    }
    if (source.trim() === '') {
      errors.push(`line ${line}: tagged block body is empty`);
    }
    if (!ALLOWED_FENCE_INFO.has(info) || source.trim() === '') {
      continue;
    }
    const lang = info.split(' ')[0] as Fence['lang'];
    fences.push({
      lang,
      reject: info.endsWith(' reject'),
      source,
      line,
    });
  }

  return { fences, errors };
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
  const { fences, errors } = extractFences(markdown);

  it('prints the block count and parses every fence with the routed reader', () => {
    expect(errors, errors.join('\n')).toEqual([]);

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

describe('fence extractor rejects bad markdown', () => {
  it('fails on a tilde fence and names the line', () => {
    const markdown = 'intro\n~~~hs\nobject Cube {}\n~~~\n';
    const { errors } = extractFences(markdown);
    expect(errors.some((error) => error.includes('line 2'))).toBe(true);
  });

  it('fails on an empty tagged block and names the line', () => {
    const markdown = 'intro\n```hs\n \t \n```\n';
    const { errors } = extractFences(markdown);
    expect(errors.some((error) => error.includes('line 2') && error.includes('empty'))).toBe(true);
  });

  it('fails on a mistyped info string and names the line and the string', () => {
    const mistyped = 'intro\n```hs rejct\nobject Cube {}\n```\n';
    const extra = 'intro\n```holo reject extra\ncomposition "Scene" {}\n```\n';
    const mistypedErrors = extractFences(mistyped).errors;
    const extraErrors = extractFences(extra).errors;
    expect(
      mistypedErrors.some((error) => error.includes('line 2') && error.includes('"hs rejct"'))
    ).toBe(true);
    expect(
      extraErrors.some((error) => error.includes('line 2') && error.includes('"holo reject extra"'))
    ).toBe(true);
  });

  it('accepts a well-formed fence', () => {
    const markdown = 'intro\n```hs\nobject Cube {\n  geometry: "cube"\n}\n```\n';
    const { fences, errors } = extractFences(markdown);
    expect(errors).toEqual([]);
    expect(fences).toHaveLength(1);
    const fence = fences[0];
    expect(fence).toMatchObject({ lang: 'hs', reject: false, line: 2 });
    expect(fence?.source.trim().length).toBeGreaterThan(0);
    expect(fence !== undefined && accepts(fence).ok).toBe(true);
  });
});
