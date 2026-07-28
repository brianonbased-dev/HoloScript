import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { PACKAGE_IR_SCHEMA_VERSION, PACKAGE_LOCK_SCHEMA_VERSION } from '../PackageIR';

const packageRoot = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const wit = readFileSync(join(packageRoot, 'wit', 'package-ir.wit'), 'utf8');

describe('PackageIR WIT projection', () => {
  it('projects the public package and lock fields without claiming a runtime implementation', () => {
    expect(wit).toContain('package holoscript:package-ir@0.1.0;');
    expect(wit).toContain('record package-ir');
    expect(wit).toContain('record package-lock-receipt');
    expect(wit).toContain('verify-cached-source: func');
    expect(wit).toContain('verify-lock: func');
    expect(PACKAGE_IR_SCHEMA_VERSION).toBe('holoscript.package-ir.v0.1');
    expect(PACKAGE_LOCK_SCHEMA_VERSION).toBe('holoscript.package-lock-receipt.v0.1');
  });
});
