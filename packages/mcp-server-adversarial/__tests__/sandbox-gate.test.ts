// G.GOLD.013 false-case discipline: the sandbox gate must ACTIVELY refuse
// load outside the sandbox. Without these tests the gate is decorative.
// G.GOLD.015: tests optimize for experienced failure categories — the
// failure category here is "package leaks into production by accident."

import { describe, expect, it } from 'vitest';
import {
  AdversarialSandboxViolation,
  assertSandbox,
  SANDBOX_ENV_VAR,
} from '../src/sandbox-gate.js';

describe('sandbox-gate', () => {
  describe('false case: refuses load outside sandbox (G.GOLD.013)', () => {
    it('throws AdversarialSandboxViolation when sandbox env var is unset', () => {
      const env = {} as NodeJS.ProcessEnv;
      expect(() => assertSandbox(env)).toThrow(AdversarialSandboxViolation);
    });

    it('throws when sandbox env var is set to anything other than "1"', () => {
      const cases = ['0', 'true', 'yes', '', 'TRUE', '1 ', ' 1'];
      for (const value of cases) {
        const env = { [SANDBOX_ENV_VAR]: value } as NodeJS.ProcessEnv;
        expect(
          () => assertSandbox(env),
          `should refuse env=${JSON.stringify(value)}`
        ).toThrow(AdversarialSandboxViolation);
      }
    });

    it('throws even with sandbox=1 if NODE_ENV is production (defense-in-depth)', () => {
      const env = {
        [SANDBOX_ENV_VAR]: '1',
        NODE_ENV: 'production',
      } as NodeJS.ProcessEnv;
      expect(() => assertSandbox(env)).toThrow(AdversarialSandboxViolation);
    });

    it('error.code is ADVERSARIAL_SANDBOX_VIOLATION', () => {
      try {
        assertSandbox({} as NodeJS.ProcessEnv);
        throw new Error('assertSandbox should have thrown');
      } catch (e) {
        expect(e).toBeInstanceOf(AdversarialSandboxViolation);
        expect((e as AdversarialSandboxViolation).code).toBe(
          'ADVERSARIAL_SANDBOX_VIOLATION'
        );
      }
    });

    it('error message names the env var so the operator knows the fix', () => {
      try {
        assertSandbox({} as NodeJS.ProcessEnv);
        throw new Error('assertSandbox should have thrown');
      } catch (e) {
        expect((e as Error).message).toContain(SANDBOX_ENV_VAR);
        expect((e as Error).message).toContain('Paper 21');
      }
    });
  });

  describe('true case: permits load inside sandbox', () => {
    it('does not throw when sandbox=1 and NODE_ENV is test', () => {
      const env = {
        [SANDBOX_ENV_VAR]: '1',
        NODE_ENV: 'test',
      } as NodeJS.ProcessEnv;
      expect(() => assertSandbox(env)).not.toThrow();
    });

    it('does not throw when sandbox=1 and NODE_ENV is unset', () => {
      const env = { [SANDBOX_ENV_VAR]: '1' } as NodeJS.ProcessEnv;
      expect(() => assertSandbox(env)).not.toThrow();
    });

    it('does not throw when sandbox=1 and NODE_ENV is development', () => {
      const env = {
        [SANDBOX_ENV_VAR]: '1',
        NODE_ENV: 'development',
      } as NodeJS.ProcessEnv;
      expect(() => assertSandbox(env)).not.toThrow();
    });
  });
});
