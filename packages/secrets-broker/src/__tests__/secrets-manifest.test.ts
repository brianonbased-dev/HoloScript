import { describe, it, expect } from 'vitest';
import {
  compileSecretsManifest,
  SecretsManifestError,
  type SecretsManifest,
} from '../secrets-manifest';

const m: SecretsManifest = {
  app: 'brittney',
  secrets: [
    { name: 'OPENAI_API_KEY', description: "User's LLM key" },
    { name: 'OPTIONAL_FLAG', required: false },
  ],
};

describe('secrets-manifest compile (one spec → many backends)', () => {
  it('env-template: names + descriptions, NO values, required/optional tags', () => {
    const out = compileSecretsManifest(m, 'env-template');
    expect(out).toContain('OPENAI_API_KEY=');
    expect(out).toContain("User's LLM key");
    expect(out).toContain('(required)');
    expect(out).toContain('(optional)');
    expect(out).not.toMatch(/OPENAI_API_KEY=\S/); // nothing after the '=' — names only, no values
  });

  it('github-actions: gh secret set commands + a workflow env block', () => {
    const out = compileSecretsManifest(m, 'github-actions');
    expect(out).toContain('gh secret set OPENAI_API_KEY');
    expect(out).toContain('OPENAI_API_KEY: ${{ secrets.OPENAI_API_KEY }}');
  });

  it('holokey-vault: vault:<name> refs + @needs_key consumption guidance', () => {
    const out = compileSecretsManifest(m, 'holokey-vault');
    expect(out).toContain('vault:OPENAI_API_KEY');
    expect(out).toContain('@needs_key');
  });

  it('throws on a non-UPPER_SNAKE name', () => {
    expect(() =>
      compileSecretsManifest({ app: 'x', secrets: [{ name: 'lower' }] }, 'env-template')
    ).toThrow(SecretsManifestError);
  });

  it('throws on duplicate names', () => {
    expect(() =>
      compileSecretsManifest({ app: 'x', secrets: [{ name: 'A' }, { name: 'A' }] }, 'env-template')
    ).toThrow(/duplicate/);
  });

  it('throws on an empty manifest', () => {
    expect(() => compileSecretsManifest({ app: 'x', secrets: [] }, 'env-template')).toThrow(
      SecretsManifestError
    );
  });
});
