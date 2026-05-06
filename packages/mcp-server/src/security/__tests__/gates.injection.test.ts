/**
 * Regression tests for Gate 1 injection-pattern detection.
 *
 * Backstory: task_1778093521547_vx4i — the original backtick-injection regex
 * /`[^`]*\b(rm|del|format)\b[^`]*`/i triggered on any backtick span containing
 * the bare word "format", which produced a Sapir-Whorf false-positive on
 * legitimate JSDoc / GLSL / CSS / API mentions of `format` (W.GOLD.039 — the
 * compiler must not be the limit of the legitimate vocabulary).
 *
 * The tightened pattern requires:
 *   - the dangerous command at the START of the backticked span
 *   - followed by at least one command-line-shaped argument
 *     (flag, path, drive letter, redirect, pipe, glob, $(...), if=/of=)
 *
 * This test pins both directions: benign `format` descriptive uses must pass,
 * real shell-substitution injections must still fail.
 */
import { describe, it, expect } from 'vitest';
import { gate1ValidateRequest } from '../gates';

describe('gate1: injection patterns — backtick command-substitution', () => {
  const callGate = (value: string) =>
    gate1ValidateRequest(
      'validate_holoscript',
      { content: value },
      'test-client',
      // pull in the production defaults; we are testing the static
      // INJECTION_PATTERNS list, not the rate-limiter
      {
        maxBodySize: 1 * 1024 * 1024,
        maxArgStringLength: 100 * 1024,
        maxArgDepth: 10,
        blockInjectionPatterns: true,
        rateLimitPerMinute: 1000,
      }
    );

  // ── Benign uses — must PASS (W.GOLD.039 — Sapir-Whorf calibration) ────────
  const benign = [
    ['math comment', 'See `format the matrix` for details'],
    ['data format key', 'Output: `format: rgba`'],
    ['format() function', 'Use `format(value, options)` here'],
    ['word substring', 'See `reformat` later'],
    ['JSDoc bare format', '/** @returns The `format` of the data */'],
    ['GLSL format hint', '// `format=rgba8` for the texture'],
    ['CSS format() src', '@font-face { src: `format("woff2")` }'],
    ['vector format key', 'fields: `format` and `stride`'],
    ['format-the-disk verb', 'verb usage: `format the disk later`'],
    ['format-as-arg-name', 'arg name: `format` (a string)'],
    ['del HTML element', 'see `del` HTML element'],
    ['rm markdown tag', 'tag `rm` for removed-line marker'],
    ['DD time-format', 'aspect: `dd:hh` time format'],
    ['format-the-array verb', '`format the array` (verb)'],
    ['rm-then-prose', 'jargon: `rm a function from API`'],
  ] as const;

  for (const [name, value] of benign) {
    it(`PASSES legitimate \`format\`/\`rm\`/\`del\` mention — ${name}`, () => {
      const result = callGate(value);
      expect(result.passed, `Should pass: ${value}\nReason: ${result.reason}`).toBe(true);
    });
  }

  // ── Real injection attempts — must BLOCK (W.GOLD.193 — defense preserved) ─
  const malicious = [
    ['rm -rf shell-sub', 'try `rm -rf /tmp` here'],
    ['format c: windows', 'windows: `format c:`'],
    ['del flag + path', 'win: `del /Q file.txt`'],
    ['rm absolute path', 'unix: `rm /etc/passwd`'],
    ['mkfs.ext4 /dev/sda1', 'wipe: `mkfs.ext4 /dev/sda1`'],
    ['dd if= of=', 'wipe: `dd if=/dev/zero of=/dev/sda`'],
    ['rm glob', 'glob: `rm *.log`'],
    ['rm with $()', 'sub: `rm $(find . -name old)`'],
    ['rm with pipe', 'pipe: `rm | tee log`'],
    ['format c: with pipe', 'pipe: `format c: | yes`'],
    ['rm with redirect', 'redir: `rm > /dev/null`'],
  ] as const;

  for (const [name, value] of malicious) {
    it(`BLOCKS real shell-substitution injection — ${name}`, () => {
      const result = callGate(value);
      expect(result.passed, `Should block: ${value}`).toBe(false);
      expect(result.reason).toMatch(/Suspicious patterns/);
    });
  }

  // ── Existing shell-injection patterns must still fire ─────────────────────
  it('still blocks ;-prefixed rm/del/format', () => {
    const result = callGate('echo hi; rm -rf /');
    expect(result.passed).toBe(false);
  });

  it('still blocks &&-prefixed rm', () => {
    const result = callGate('do_thing && rm /etc/shadow');
    expect(result.passed).toBe(false);
  });

  it('still blocks $() command substitution', () => {
    const result = callGate('eval $(rm /tmp/foo)');
    expect(result.passed).toBe(false);
  });
});
