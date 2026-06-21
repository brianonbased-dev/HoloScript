/**
 * @holoscript/plugin-holonews
 *
 * HoloNews Plugin — verifiable-claim news layer for HoloLand.
 *
 * Phase 0 surface:
 *   - @claim_kiosk trait: in-zone proof-display primitive (T-NEWS-KIOSK)
 *   - ProofAdjacencyGuard: structural invariant enforcement (G.910.01 / T-NEWS-CI)
 *
 * The verifier is `verify_cael_trace` in packages/mcp-server/src/simulation-tools.ts.
 * The kiosk binds its output (a CaelReceipt) to a spatial in-zone object and
 * enforces the proof-adjacency wall across all compile targets.
 *
 * NOT in this phase:
 *   - News plugin + Formalizer + GDELT firehose (Phase 2, B.4 gap #4)
 *   - `hololand_capture_runtime_receipt` real-verification wiring (Phase 1, B.4 gap #2)
 *   - Durable world content (Phase 1, B.4 gap #3)
 *   - Stubbed hololandRoutes wiring (Phase 2, B.4 gap #5)
 */

export {
  createClaimKioskHandler,
  buildCaelReceipt,
  defaultClaimKioskConfig,
} from './traits/claim-kiosk-trait.mjs';

export {
  resolveProofAdjacencyPolicy,
  auditReceiptForWallInvariant,
  buildKioskDisplayModel,
} from './traits/proof-adjacency-guard.mjs';

import { createClaimKioskHandler } from './traits/claim-kiosk-trait.mjs';

export const pluginMeta = {
  name: '@holoscript/plugin-holonews',
  version: '1.0.0',
  traits: ['claim_kiosk'],
  handlers: [createClaimKioskHandler()],
  description: 'HoloNews verifiable-claim display primitive for HoloLand in-zone objects.',
};
