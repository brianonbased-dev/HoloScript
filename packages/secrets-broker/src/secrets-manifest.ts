/**
 * HoloKey secrets manifest — declare an app's secret NEEDS once, compile to many backends.
 *
 * This is the "secrets-as-a-compile-target" innovation: the `BrokerManifest.storage` enum
 * already anticipated `vault | github-actions-secret | env-file`, and this turns that into a
 * real emitter. A single {@link SecretsManifest} (names + descriptions, NEVER values)
 * compiles to:
 *   - `env-template`    — a `.env.example`-style scaffold (names only) for local onboarding.
 *   - `github-actions`  — `gh secret set …` commands + a workflow `env:` block that references them.
 *   - `holokey-vault`   — the `vault:<name>` refs + how to store (SecretStore.put) and consume
 *                         (`@needs_key`) them in HoloKey natively.
 *
 * So "native vault vs GitHub secrets vs env" stops being a fork: you declare once and emit the
 * backend your deployment needs. The manifest carries ZERO secret material — only names + metadata.
 *
 * @module secrets-broker/secrets-manifest
 */

/** One declared secret an app needs. Carries NO value — only the name + metadata. */
export interface SecretDecl {
  /** Env-var-style secret name, e.g. `OPENAI_API_KEY`. Becomes the `vault:<name>` key. */
  name: string;
  /** Human-readable description for templates / docs. */
  description?: string;
  /** Whether the app requires it. Defaults to true. */
  required?: boolean;
}

/** An app's full secret-needs declaration. */
export interface SecretsManifest {
  /** App / namespace name (used in headers). */
  app: string;
  secrets: readonly SecretDecl[];
}

/** Supported compile targets — mirrors `BrokerManifest.storage`. */
export type SecretsCompileTarget =
  | 'env-template'
  | 'github-actions'
  | 'holokey-vault'
  | 'infra-namespace';

/** Thrown when a manifest is malformed (e.g. a non-env-var-style name). */
export class SecretsManifestError extends Error {
  constructor(message: string) {
    super(`secrets-manifest: ${message}`);
    this.name = 'SecretsManifestError';
  }
}

const NAME_RE = /^[A-Z][A-Z0-9_]*$/;

function validate(manifest: SecretsManifest): void {
  if (!manifest.app) throw new SecretsManifestError('manifest.app is required');
  if (!Array.isArray(manifest.secrets) || manifest.secrets.length === 0) {
    throw new SecretsManifestError('manifest.secrets must be a non-empty array');
  }
  const seen = new Set<string>();
  for (const s of manifest.secrets) {
    if (!NAME_RE.test(s.name)) {
      throw new SecretsManifestError(
        `secret name "${s.name}" must be UPPER_SNAKE (^[A-Z][A-Z0-9_]*$)`
      );
    }
    if (seen.has(s.name)) throw new SecretsManifestError(`duplicate secret name "${s.name}"`);
    seen.add(s.name);
  }
}

function isRequired(s: SecretDecl): boolean {
  return s.required !== false;
}

function emitEnvTemplate(m: SecretsManifest): string {
  const lines = [
    `# ${m.app} — required secrets (.env). Fill values locally; never commit this file.`,
    '',
  ];
  for (const s of m.secrets) {
    const tag = isRequired(s) ? 'required' : 'optional';
    if (s.description) lines.push(`# ${s.description}`);
    lines.push(`# (${tag})`);
    lines.push(`${s.name}=`);
    lines.push('');
  }
  return lines.join('\n').trimEnd() + '\n';
}

function emitGithubActions(m: SecretsManifest): string {
  const setCmds = [
    `# Set ${m.app} secrets as GitHub Actions secrets (run once; values are prompted, never echoed):`,
  ];
  for (const s of m.secrets) {
    if (s.description) setCmds.push(`# ${s.description}`);
    setCmds.push(`gh secret set ${s.name}`);
  }
  const envBlock = ['', '# Reference them in a workflow step:', 'env:'];
  for (const s of m.secrets) {
    envBlock.push(`  ${s.name}: \${{ secrets.${s.name} }}`);
  }
  return [...setCmds, ...envBlock].join('\n') + '\n';
}

function emitHoloKeyVault(m: SecretsManifest): string {
  const lines = [
    `# ${m.app} — HoloKey native vault refs`,
    '#',
    '# Store (server-side, per authenticated owner):',
    `#   store.put({ ownerId, name: '<NAME>', value })`,
    '# Consume in a HoloScript composition (value resolved at use-time, never in source):',
    `#   object "<X>" @needs_key { ref: "vault:<NAME>", purpose: "<why>" }`,
    '',
  ];
  for (const s of m.secrets) {
    const tag = isRequired(s) ? 'required' : 'optional';
    lines.push(`vault:${s.name}${s.description ? `   # ${s.description}` : ''} (${tag})`);
  }
  return lines.join('\n') + '\n';
}

function emitInfraNamespace(m: SecretsManifest): string {
  const lines = [
    `# ${m.app} — HoloKey infra namespace refs`,
    '#',
    '# Use from a Railway service, Jetson, or fleet worker after service identity is present.',
    '# The resolver binds the value to the service owner and maps infra://<NAME> to vault:<NAME>.',
    '# No human workspace secret:// ref or plaintext value is required.',
    '',
  ];
  for (const s of m.secrets) {
    const tag = isRequired(s) ? 'required' : 'optional';
    lines.push(`infra://${s.name}${s.description ? `   # ${s.description}` : ''} (${tag})`);
  }
  return lines.join('\n') + '\n';
}

/**
 * Compile a {@link SecretsManifest} to a backend artifact. Pure; emits text only and never
 * includes secret values (the manifest has none).
 */
export function compileSecretsManifest(
  manifest: SecretsManifest,
  target: SecretsCompileTarget
): string {
  validate(manifest);
  switch (target) {
    case 'env-template':
      return emitEnvTemplate(manifest);
    case 'github-actions':
      return emitGithubActions(manifest);
    case 'holokey-vault':
      return emitHoloKeyVault(manifest);
    case 'infra-namespace':
      return emitInfraNamespace(manifest);
    default: {
      // Exhaustiveness guard.
      const never: never = target;
      throw new SecretsManifestError(`unknown target "${String(never)}"`);
    }
  }
}
