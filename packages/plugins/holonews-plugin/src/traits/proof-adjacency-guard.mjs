/**
 * ProofAdjacencyGuard — pure ESM implementation of the proof-adjacency wall invariant.
 *
 * INVARIANT (G.910.01):
 *   A "proven" badge MAY ONLY be displayed when the not-proven boundary text
 *   (`notProvenWall`) is rendered at equal or greater prominence on the SAME
 *   surface in the SAME viewport.
 *
 *   Any compile target that cannot honour this constraint MUST suppress the
 *   badge entirely and show the claim text + re-run link only.
 *
 * This file is pure .mjs so it can be imported by Node-native scripts tests
 * (scripts/__tests__/holonews-proof-adjacency.test.mjs) without a TS loader.
 * The TypeScript wrappers (ProofAdjacencyGuard.ts) re-export from this file.
 *
 * FALSIFICATION CONTRACT (T-NEWS-CI):
 *   `scripts/__tests__/holonews-proof-adjacency.test.mjs` checks every branch
 *   of `resolveProofAdjacencyPolicy` at build time.  A CI failure there means
 *   this invariant has been violated.
 */

/**
 * Resolve which proof-adjacency policy applies for a given receipt and compile
 * target capability.
 *
 * Pure function — no side effects, no I/O, deterministic output.
 *
 * @param {import('./types.js').CaelReceipt} receipt
 * @param {boolean} canRenderWall  Whether the current compile target can co-render
 *   the not-proven wall alongside the badge in the same viewport.
 * @returns {import('./types.js').ProofAdjacencyPolicy}
 */
export function resolveProofAdjacencyPolicy(receipt, canRenderWall) {
  // If the verdict is not proven, there is never a badge to display.
  if (receipt.verdict !== 'proven') {
    return 'no-badge';
  }

  // A proven verdict with no wall text means the not-proven boundary was not
  // authored.  Without it the badge is structurally unanchored — suppress.
  if (!receipt.notProvenWall || receipt.notProvenWall.trim() === '') {
    return 'badge-suppressed-rerun-only';
  }

  // The target claims it can render the wall.  Trust it — but the CI test
  // verifies that this branch is never reached without a non-empty wall.
  if (canRenderWall) {
    return 'badge-with-wall';
  }

  // Target cannot render the wall (OG card, social crop, etc.) — suppress.
  return 'badge-suppressed-rerun-only';
}

/**
 * Validate that a CaelReceipt meets the minimum requirements for the
 * proof-adjacency invariant.
 *
 * Returns a list of violation strings.  Empty array means the receipt is
 * structurally sound.
 *
 * @param {import('./types.js').CaelReceipt} receipt
 * @returns {string[]}
 */
export function auditReceiptForWallInvariant(receipt) {
  const violations = [];

  if (receipt.verdict === 'proven') {
    if (!receipt.notProvenWall || receipt.notProvenWall.trim() === '') {
      violations.push(
        `Receipt ${receipt.receiptId}: verdict is "proven" but notProvenWall is absent or empty. ` +
          `The proof-adjacency wall cannot be rendered — badge will be suppressed on all targets.`,
      );
    }
    if (!receipt.verifyUrl || !receipt.verifyUrl.startsWith('http')) {
      violations.push(
        `Receipt ${receipt.receiptId}: verdict is "proven" but verifyUrl is missing or invalid. ` +
          `Readers cannot independently re-run the proof.`,
      );
    }
    if (!receipt.hashChainValid) {
      violations.push(
        `Receipt ${receipt.receiptId}: verdict is "proven" but hashChainValid is false. ` +
          `This is a contradictory state — the receipt is structurally corrupt.`,
      );
    }
    if (!receipt.replayValid) {
      violations.push(
        `Receipt ${receipt.receiptId}: verdict is "proven" but replayValid is false. ` +
          `This is a contradictory state — the receipt is structurally corrupt.`,
      );
    }
  }

  return violations;
}

/**
 * Build the display model for a kiosk render from a receipt and a target
 * capability flag.
 *
 * This is the single data-transformation step between a raw receipt and the
 * in-zone object's render output.  Compile targets consume this record; they
 * do not inspect the raw receipt directly.
 *
 * @param {import('./types.js').CaelReceipt} receipt
 * @param {boolean} canRenderWall
 * @returns {{
 *   policy: import('./types.js').ProofAdjacencyPolicy,
 *   claimText: string,
 *   wallText: string | undefined,
 *   showBadge: boolean,
 *   verifyUrl: string | undefined,
 *   showEnvelope: boolean,
 *   auditViolations: string[],
 * }}
 */
export function buildKioskDisplayModel(receipt, canRenderWall) {
  const policy = resolveProofAdjacencyPolicy(receipt, canRenderWall);
  const auditViolations = auditReceiptForWallInvariant(receipt);

  return {
    policy,
    claimText: receipt.claimText,
    wallText: policy === 'badge-with-wall' ? receipt.notProvenWall : undefined,
    showBadge: policy === 'badge-with-wall',
    verifyUrl: receipt.verdict === 'proven' ? receipt.verifyUrl : undefined,
    showEnvelope: policy !== 'no-badge' && receipt.envelope != null,
    auditViolations,
  };
}
