/**
 * @fileoverview Authority analysis — cross-file symbol-table foundation + consumers
 * @module @holoscript/core/compiler/authority
 *
 * The round-3 symbol-table investment shared by both deferred MMO seeds:
 *   - {@link AuthoritySymbolGraph}        — the merged, tier-tagged symbol table.
 *   - {@link buildColyseusAuthorityGraph} — Colyseus result → graph bridge.
 *   - {@link splitServerAuthority}        — P2.0 server/client bundle split + proof.
 *
 * The cross-file ProvenanceBoundsChecker (P2.12) consumes the same
 * {@link AuthoritySymbolGraph}.
 */

export * from './AuthoritySymbolGraph';
export * from './ColyseusAuthorityManifest';
export * from './ServerAuthorityBundleSplitter';
