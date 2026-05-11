// Sandbox-gate: refuses to load this package outside an explicit sandbox env.
// W.GOLD.035 / W.GOLD.039 — Sapir-Whorf compile-level lexical firewalling.
// Importing this module IS the consent; assertSandbox() runs at index.ts load.

export const SANDBOX_ENV_VAR = 'HOLOMESH_ADVERSARIAL_SANDBOX';

export class AdversarialSandboxViolation extends Error {
  readonly code = 'ADVERSARIAL_SANDBOX_VIOLATION';

  constructor(reason: string) {
    super(
      `@holoscript/mcp-server-adversarial refused to load: ${reason}. ` +
        `This package contains attack-PoC code for Paper 21 (Adversarial Trust Injection). ` +
        `It MUST NEVER be imported in production or against a live HoloMesh. ` +
        `Set ${SANDBOX_ENV_VAR}=1 (and ensure NODE_ENV !== 'production') to opt-in. ` +
        `Per Paper 21 §8 Q2 ethical bright line: no live-system attacks, ever.`
    );
    this.name = 'AdversarialSandboxViolation';
  }
}

export function assertSandbox(env: NodeJS.ProcessEnv = process.env): void {
  const flag = env[SANDBOX_ENV_VAR];
  if (flag !== '1') {
    throw new AdversarialSandboxViolation(
      `${SANDBOX_ENV_VAR} env var is not set to '1' (got ${JSON.stringify(flag)})`
    );
  }
  if (env.NODE_ENV === 'production') {
    throw new AdversarialSandboxViolation(
      `NODE_ENV='production' detected (defense-in-depth refusal)`
    );
  }
}
