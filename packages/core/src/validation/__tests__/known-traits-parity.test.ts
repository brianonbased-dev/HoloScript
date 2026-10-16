/**
 * One known-trait check (KnownTraits.ts) behind HS1006 on every surface.
 *
 * - The unit block pins what "known" means (the four core vocabularies, spelling folding,
 *   in-file declarations, caller names) and that DERIVED_TRAIT_NAMES matches the schemas.
 * - The corpus block runs every tracked .holo/.hsplus under examples/, compositions/ and
 *   scripts/holo-ci/ through the canonical validator (the CLI's `validate`, MCP's
 *   `validate_holoscript` and `hs_diagnostics`, and the LSP all take HS1006 from it) and through
 *   the strict layer, and requires the same unknown-trait names in the same files. HS1006 is a
 *   warning on both, and never changes the canonical verdict.
 */
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  isKnownTrait,
  findUnknownTraits,
  declaredTraitNames,
  coreKnownTraitNames,
} from '../KnownTraits';
import { validateCanonicalSource } from '../CanonicalSourceValidator';
import { DERIVED_TRAIT_NAMES } from '../../compiler/identity/derived-trait-names.generated';
import { DERIVED_TRAIT_SCHEMAS } from '../../compiler/identity/derived-trait-schemas.generated';
import { VR_TRAITS } from '../../traits/constants';
import { buildKnownTraitSet } from '../../traits/knownTraitSet';
import TRAIT_REGISTRY from '../../traits/trait-registry.json';
import * as parser from '../../parser/index';
import { HoloScriptPlusParser } from '../../parser/HoloScriptPlusParser';
// @ts-expect-error -- plain .mjs without types
import { analyze } from '../../../strict/holo_strict.mjs';

const REPO = path.resolve(__dirname, '../../../../..');
const strictDeps = {
  tokenizeHoloSource: parser.tokenizeHoloSource,
  parseHolo: parser.parseHolo,
  isKnownTrait: parser.isKnownTrait,
  declaredTraitNames: parser.declaredTraitNames,
};
const strictUnknown = (source: string) =>
  (analyze(source, strictDeps).diagnostics as Array<{ code: string; severity: string; message: string }>)
    .filter((d) => d.code === 'HS1006');
const nameOf = (message: string) => /"@([^"]+)"/.exec(message)?.[1] ?? message;

describe('isKnownTrait: the one known-trait set', () => {
  it('knows every name of all four core vocabularies', () => {
    for (const list of [
      VR_TRAITS,
      Object.keys(TRAIT_REGISTRY as Record<string, unknown>),
      [...buildKnownTraitSet()],
      DERIVED_TRAIT_NAMES,
    ]) {
      const missing = [...list].filter((n) => !isKnownTrait(n));
      expect(missing).toEqual([]);
    }
    expect(coreKnownTraitNames().size).toBeGreaterThan(VR_TRAITS.length);
  });

  it('counts trait-registry.json ids as known (e.g. a registry-only id)', () => {
    const registryOnly = Object.keys(TRAIT_REGISTRY as Record<string, unknown>).find(
      (id) => !(buildKnownTraitSet() as Set<string>).has(id)
    );
    expect(registryOnly).toBeTruthy();
    expect(isKnownTrait(registryOnly)).toBe(true);
  });

  it('folds spellings and @, and refuses invented names', () => {
    expect(isKnownTrait('@grabbable')).toBe(true);
    expect(isKnownTrait('Grabbable')).toBe(true);
    expect(isKnownTrait('nope_xyz_123')).toBe(false);
    expect(isKnownTrait('')).toBe(false);
  });

  it('knows names declared in the source and passed by the caller', () => {
    const ast = parser.parseHolo(
      'object "A" {\n  @trait(name: "@sparkle")\n  @sparkle\n  @plugin_thing\n}\n'
    ).ast;
    const declared = declaredTraitNames(ast);
    expect([...declared].sort()).toEqual(expect.arrayContaining(['sparkle', 'trait']));
    expect(findUnknownTraits(ast).map((u) => u.name)).toEqual(['plugin_thing']);
    expect(findUnknownTraits(ast, { knownTraits: ['pluginThing'] })).toEqual([]);
  });

  it('DERIVED_TRAIT_NAMES is exactly the DERIVED_TRAIT_SCHEMAS names (drift guard)', () => {
    expect([...DERIVED_TRAIT_NAMES]).toEqual(DERIVED_TRAIT_SCHEMAS.map((s) => s.name));
  });
});

describe('HS1006 on the canonical validator (CLI, MCP, LSP)', () => {
  const src = 'composition "T" {\n  object "A" {\n    @nope_xyz\n    @grabbable\n  }\n}\n';

  it('.holo: one HS1006 warning at the @, verdict unchanged', () => {
    const r = validateCanonicalSource({ source: src, fileName: 't.holo' });
    expect(r.valid).toBe(true);
    expect(r.errors).toEqual([]);
    expect(r.warnings.filter((w) => w.code === 'HS1006')).toEqual([
      expect.objectContaining({ severity: 'warning', line: 3, column: 5, message: 'Unknown trait "@nope_xyz".' }),
    ]);
  });

  it('.hsplus: HS1006 is authoritative, HSP001 for the same @ is not repeated', () => {
    const direct = new HoloScriptPlusParser().parse(src);
    expect(direct.warnings.some((w) => /Unknown directive @nope_xyz/.test(String(w.message)))).toBe(true);
    const r = validateCanonicalSource({ source: src, fileName: 't.hsplus' });
    expect(r.valid).toBe(true);
    expect(r.warnings.filter((w) => w.code === 'HS1006').map((w) => [w.line, nameOf(w.message)])).toEqual([[3, 'nope_xyz']]);
    expect(r.warnings.some((w) => /Unknown directive @nope_xyz/.test(w.message))).toBe(false);
  });

  it('HSP001 is derived from the same set: a registry-only trait is not an unknown directive', () => {
    const registryOnly = Object.keys(TRAIT_REGISTRY as Record<string, unknown>).find(
      (id) => /^[a-z_]+$/.test(id) && !(VR_TRAITS as readonly string[]).includes(id)
    )!;
    const r = new HoloScriptPlusParser().parse(`object "A" {\n  @${registryOnly}\n}\n`);
    expect(r.warnings.some((w) => String(w.message).includes(`@${registryOnly}`))).toBe(false);
  });

  it('caller-passed knownTraits silence HS1006', () => {
    const r = validateCanonicalSource({ source: src, fileName: 't.holo', knownTraits: ['nope_xyz'] });
    expect(r.warnings.filter((w) => w.code === 'HS1006')).toEqual([]);
  });

  it('a doc tag in a comment is not a trait use', () => {
    const r = validateCanonicalSource({ source: '// @version 2\n' + src, fileName: 't.holo' });
    expect(r.warnings.filter((w) => w.code === 'HS1006').map((w) => nameOf(w.message))).toEqual(['nope_xyz']);
  });
});

/**
 * The strict layer reads every source with the `.holo` grammar (it has no filename), so on a
 * `.hsplus` file it sees different trait uses than the `.hsplus` parser the canonical validator
 * uses (e.g. it reads `@import`/`@if`/`@else` as traits, `@on_update` is a lifecycle hook to the
 * `.hsplus` parser, and it stops early on some `.hsplus`-only syntax). Same known-trait set, different
 * parse. These files, measured 2026-10-15, are where that shows; the list is exact both ways.
 * Every `.holo` file must match with no exception.
 */
const STRICT_HSPLUS_GRAMMAR_GAP = new Set([
  'compositions/caveman-npc-brain.hsplus',
  'compositions/environments/forest-clearing.hsplus',
  'compositions/frame-declaration-example.hsplus',
  'compositions/reconstruct-train-twin-brain.hsplus',
  'examples/autonomous-ecosystems/agent-portal-federation.hsplus',
  'examples/autonomous-ecosystems/cultural-evolution.hsplus',
  'examples/autonomous-ecosystems/feedback-driven-npc.hsplus',
  'examples/cryptography/secure-agent-handshake.hsplus',
  'examples/game-state-machine.hsplus',
  'examples/hsplus/agents/moderator-agent.hsplus',
  'examples/hsplus/agents/researcher-agent.hsplus',
  'examples/hsplus/agents/watcher-agent.hsplus',
  'examples/hsplus/governance/norm-enforcer.hsplus',
  'examples/hsplus/multi-agent/planner-executor-reviewer.hsplus',
  'examples/hsplus/runtime/webhook-driven-agent.hsplus',
  'examples/hsplus/systems/typed-sensor-service.hsplus',
  'examples/language-reference/04-modules-imports.hsplus',
  'examples/pinball.hsplus',
  'examples/pinball.refreshed.hsplus',
  'examples/rendering/rendering-lighting-showcase.hsplus',
  'examples/showcase/narrative-enterprise-analytics-security-showcase.hsplus',
  'examples/showcase/npc-affordance-social-game-showcase.hsplus',
  'examples/showcase/state-emotion-weather-procedural-showcase.hsplus',
  'examples/traits/iot-digital-twin-mqtt-telemetry.hsplus',
  'examples/traits/networking-synced-persistent-owned.hsplus',
  'examples/traits/physics-object-lifecycle.hsplus',
  'examples/traits/state-reactive-observable-computed-statemachine.hsplus',
  'examples/xr/xr-platform-showcase.hsplus',
]);

describe('corpus parity: canonical validator and strict layer report the same unknown traits', () => {
  // No shell (Windows pre-push has no grep and cmd does not strip single quotes): git gets the
  // pathspecs as argv, and the extension filter runs in JS.
  const files = execFileSync('git', ['ls-files', '--', 'examples', 'compositions', 'scripts/holo-ci'], {
    cwd: REPO,
    encoding: 'utf8',
  })
    .split(/\r?\n/)
    .map((f) => f.trim())
    .filter((f) => /\.(holo|hsplus)$/.test(f));

  // 530 tracked .holo/.hsplus files at f5c135bc; a floor keeps an empty listing from passing.
  const MIN_CORPUS_FILES = 450;
  it('lists the corpus (at least MIN_CORPUS_FILES files)', () => {
    expect(files.length).toBeGreaterThanOrEqual(MIN_CORPUS_FILES);
  });

  it(
    'same names in the same files, all warnings, verdicts unchanged by HS1006',
    () => {
      const mismatches: string[] = [];
      let filesWithUnknown = 0;
      const names = new Set<string>();
      for (const file of files) {
        const source = readFileSync(path.join(REPO, file), 'utf8');
        const strict = strictUnknown(source);
        let canonical: Array<{ code?: string; severity: string; message: string }> = [];
        try {
          const r = validateCanonicalSource({ source, fileName: file });
          canonical = r.warnings.filter((w) => w.code === 'HS1006');
          // HS1006 is authoritative: no HSP001 "Unknown directive" is left beside it.
          expect(r.warnings.filter((w) => /Unknown directive @/.test(w.message))).toEqual([]);
          expect(r.errors.some((e) => e.code === 'HS1006')).toBe(false);
        } catch {
          canonical = [];
        }
        expect(strict.every((d) => d.severity === 'warning')).toBe(true);
        const a = [...new Set(strict.map((d) => nameOf(d.message)))].sort();
        const b = [...new Set(canonical.map((d) => nameOf(d.message)))].sort();
        if (JSON.stringify(a) !== JSON.stringify(b)) mismatches.push(file);
        if (a.length) filesWithUnknown++;
        for (const n of a) names.add(n);
      }
      // eslint-disable-next-line no-console
      console.log(`[known-traits-parity] ${files.length} files, ${filesWithUnknown} with HS1006, ${names.size} names`);
      expect(mismatches.filter((f) => !f.endsWith('.hsplus'))).toEqual([]);
      expect(mismatches.filter((f) => f.endsWith('.hsplus')).sort()).toEqual(
        [...STRICT_HSPLUS_GRAMMAR_GAP].sort()
      );
    },
    300_000
  );
});
