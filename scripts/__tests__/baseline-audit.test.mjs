import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { auditTsconfigs, validateCompilerOptions } from '../holo-ci/baseline-audit.mjs';

describe('baseline audit compiler invariants', () => {
  it('rejects importing TypeScript extensions in an emitting project', () => {
    assert.deepEqual(validateCompilerOptions('packages/example/tsconfig.json', {
      allowImportingTsExtensions: true,
      noEmit: false,
    }).code, 'TS5096');
  });

  it('allows the flag for no-emit typecheck projects', () => {
    assert.equal(validateCompilerOptions('tsconfig.json', {
      allowImportingTsExtensions: true,
      noEmit: true,
    }), null);
  });

  it('allows declaration-only projects', () => {
    assert.equal(validateCompilerOptions('tsconfig.json', {
      allowImportingTsExtensions: true,
      emitDeclarationOnly: true,
      noEmit: false,
    }), null);
  });

  it('keeps the workspace free of effective TS5096 violations', () => {
    const result = auditTsconfigs();
    assert.deepEqual(result.violations, []);
    assert.deepEqual(result.unreadable, []);
  });
});
