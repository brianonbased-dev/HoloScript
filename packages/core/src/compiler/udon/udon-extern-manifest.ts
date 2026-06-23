/**
 * Udon EXTERN signature manifest + opcode set — Phase 1 "offline Udon ground truth".
 *
 * This is the SEED subset of VRChat's Udon node registry: only the EXTERN signatures
 * the Phase-2 `@clickable` → toggle codegen emits. The full manifest — a snapshot of
 * the complete Udon node-definition registry, keyed by SDK version — is the remaining
 * Phase-1 deliverable (see research/2026-06-22_holoscript-to-byte-vrchat-roadmap.md).
 *
 * INTEGRITY RULE: every signature here is a real, well-established Udon node — never one
 * invented to make a validator pass. EXTERN-resolution validation is only as trustworthy
 * as this manifest, so a signature must never appear here unless it exists in VRChat's
 * Udon node registry. The Udon signature shape is `{Namespace}{Type}.__{member}__{Params}__{Return}`.
 */

/** The nine Udon Assembly opcodes. */
export const UDON_OPCODES: ReadonlySet<string> = new Set<string>([
  'NOP',
  'PUSH',
  'POP',
  'JUMP',
  'JUMP_IF_FALSE',
  'EXTERN',
  'JUMP_INDIRECT',
  'COPY',
  'ANNOTATION',
]);

/** Sentinel jump target that ends program execution (returns from the Udon event). */
export const UDON_RETURN_ADDRESS = '0xFFFFFFFF';

export interface UdonExternManifest {
  /** Unity/VRChat SDK version this signature snapshot corresponds to. */
  readonly sdkVersion: string;
  /** True only for a full registry snapshot; the seed below is a curated subset. */
  readonly complete: boolean;
  /** Valid EXTERN signature strings. */
  readonly signatures: ReadonlySet<string>;
}

/**
 * Seed manifest — the minimum to validate the `@clickable` → toggle vertical slice.
 * `complete: false` signals downstream tools that an unresolved EXTERN may be a real
 * node simply absent from the seed, not necessarily an invalid signature.
 */
export const UDON_EXTERN_MANIFEST_SEED: UdonExternManifest = {
  sdkVersion: '2022.3.22f1',
  complete: false,
  signatures: new Set<string>([
    // GameObject.activeSelf getter → bool
    'UnityEngineGameObject.__get_activeSelf__SystemBoolean',
    // GameObject.SetActive(bool) → void
    'UnityEngineGameObject.__SetActive__SystemBoolean__SystemVoid',
  ]),
};

/** True if `signature` resolves against `manifest` (defaults to the seed). */
export function isKnownExtern(
  signature: string,
  manifest: UdonExternManifest = UDON_EXTERN_MANIFEST_SEED
): boolean {
  return manifest.signatures.has(signature);
}
