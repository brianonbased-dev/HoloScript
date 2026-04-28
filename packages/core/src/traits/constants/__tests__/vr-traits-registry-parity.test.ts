import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { VR_TRAITS } from '../index';

const REGISTRY_PATH = path.join(__dirname, '..', '..', 'trait-registry.json');
const INDEX_PATH = path.join(__dirname, '..', 'index.ts');

const TRAIT_NAME_RE = /^[a-z][a-z0-9_]*$/;

const KNOWN_DRIFT_BASELINE = 98;

describe('VR_TRAITS / trait-registry.json parity (A-009 follow-up regression gate)', () => {
  const registry = JSON.parse(fs.readFileSync(REGISTRY_PATH, 'utf8')) as Record<string, unknown>;
  const traitSet = new Set<string>(VR_TRAITS as readonly string[]);

  it('snake_case registry keys missing from VR_TRAITS does not exceed baseline', () => {
    const traitKeys = Object.keys(registry).filter(k => TRAIT_NAME_RE.test(k));
    const missing = traitKeys.filter(k => !traitSet.has(k));

    if (missing.length > KNOWN_DRIFT_BASELINE) {
      const newOnes = missing.length - KNOWN_DRIFT_BASELINE;
      throw new Error(
        `VR_TRAITS / trait-registry.json drift grew by ${newOnes} ` +
        `(now ${missing.length}, baseline ${KNOWN_DRIFT_BASELINE}).\n\n` +
        `Most likely you added an entry to trait-registry.json without wiring ` +
        `the trait name into packages/core/src/traits/constants/<category>.ts.\n\n` +
        `Fix: add the new trait name to the appropriate category file, then re-run.\n\n` +
        `Full missing list (${missing.length}):\n  ${missing.join('\n  ')}`
      );
    }
    expect(missing.length).toBeLessThanOrEqual(KNOWN_DRIFT_BASELINE);
  });

  it('every category file imported into index.ts is also spread into VR_TRAITS (orphan-category gate)', () => {
    const indexSrc = fs.readFileSync(INDEX_PATH, 'utf8');

    const importMatches = [...indexSrc.matchAll(/^import\s+\{\s*([^}]+)\s*\}\s+from\s+['"](\.[^'"]+)['"]/gm)];
    const importedTraits: { name: string; from: string }[] = [];
    for (const m of importMatches) {
      const names = m[1].split(',').map(s => s.trim()).filter(s => /^\w+_TRAITS$/.test(s));
      for (const name of names) importedTraits.push({ name, from: m[2] });
    }

    const spreadMatches = [...indexSrc.matchAll(/^\s*\.\.\.(\w+_TRAITS)\s*,/gm)];
    const spreadSet = new Set(spreadMatches.map(m => m[1]));

    const orphans = importedTraits.filter(t => !spreadSet.has(t.name));

    if (orphans.length) {
      throw new Error(
        `Orphan category file(s) detected in traits/constants/index.ts.\n` +
        `These _TRAITS arrays are imported but NEVER spread into VR_TRAITS, ` +
        `so the parser silently rejects every directive in them as HSP001:\n\n` +
        orphans.map(o => `  - ${o.name} (from ${o.from})`).join('\n') +
        `\n\nFix: add \`...${orphans[0].name},\` inside the VR_TRAITS array literal in index.ts.`
      );
    }
    expect(orphans).toEqual([]);
  });
});
