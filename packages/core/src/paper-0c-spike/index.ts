/**
 * paper-0c-spike barrel — public surface for the CAEL paper-0c primitives
 * that downstream packages (engine) consume via the `@holoscript/core/paper-0c-spike`
 * subpath.
 *
 * Kept narrow on purpose: only the subgrid-attestation primitive is exported
 * today. Other paper-0c-spike modules (quantum-registry, spike-encoder /
 * spike-decoder, stage-a/b/c) are internal-only until a downstream package
 * needs them across the package boundary.
 *
 * See `subgrid-attestation.ts` for the full design rationale and the
 * "Integration hook" section that documents how engine should wire this in.
 */

export * from './subgrid-attestation';
