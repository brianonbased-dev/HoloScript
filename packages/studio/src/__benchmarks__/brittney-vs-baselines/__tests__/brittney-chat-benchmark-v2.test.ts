import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { buildKnownTraitSet, parseHolo } from '@holoscript/core';

const FIXTURE_PATH = path.resolve(
  __dirname,
  '..',
  'fixtures',
  'brittney-chat-benchmark-v2.holo'
);

const LEGACY_UNKNOWN_TRAITS = [
  'trait',
  'validate_json_encoding',
  'track_latency',
  'detect_destructive_language',
] as const;

const REQUIRED_CANONICAL_TRAITS = [
  'data_quality',
  'schema_migrate',
  'telemetry',
  'slo_monitor',
  'profiler',
  'moderation',
  'care_ethics',
  'audit_log',
] as const;

function extractTraits(source: string): string[] {
  return Array.from(source.matchAll(/@([A-Za-z_][A-Za-z0-9_]*)/g), (match) => match[1]);
}

describe('brittney-chat-benchmark-v2 fixture', () => {
  it('uses canonical parser-known traits instead of legacy unknown benchmark labels', () => {
    const source = fs.readFileSync(FIXTURE_PATH, 'utf8');
    const traits = extractTraits(source);
    const traitSet = new Set(traits);
    const knownTraits = buildKnownTraitSet();

    for (const legacyName of LEGACY_UNKNOWN_TRAITS) {
      expect(traitSet.has(legacyName), `legacy @${legacyName} should not appear`).toBe(false);
    }

    for (const canonicalName of REQUIRED_CANONICAL_TRAITS) {
      expect(traitSet.has(canonicalName), `fixture should use @${canonicalName}`).toBe(true);
      expect(knownTraits.has(canonicalName), `@${canonicalName} should be parser-known`).toBe(true);
    }

    const unknown = traits.filter((name) => !knownTraits.has(name));
    expect(unknown).toEqual([]);
  });

  it('parses without unknown-trait diagnostics before benchmark promotion', () => {
    const source = fs.readFileSync(FIXTURE_PATH, 'utf8');
    const result = parseHolo(source, {
      knownTraits: buildKnownTraitSet(),
      strict: true,
      tolerant: false,
    });
    const diagnostics = [...(result.errors ?? []), ...(result.warnings ?? [])]
      .map((entry) => entry.message)
      .filter((message) => /unknown.*trait|trait.*unknown/i.test(message));

    expect(result.success).toBe(true);
    expect(diagnostics).toEqual([]);
    expect(result.ast?.scenes?.[0]?.objects).toHaveLength(3);
  });
});
