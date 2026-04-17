/**
 * Studio re-exports for Gist / GitHub publication manifest (Doors 1 + 3).
 *
 * Imports core source directly so Studio typechecks even when `dist/` is stale;
 * `@holoscript/core` public entry re-exports these after the next successful core build.
 */
export {
  GIST_PUBLICATION_MANIFEST_VERSION,
  provenanceDocumentIdForRoom,
  computeProvenanceSemiringDigestV0,
  buildGistPublicationManifest,
  serializeGistPublicationManifest,
  type GistPublicationManifestV0,
  type ProvenanceReceiptBinding,
  type ProvenanceSemiringDigestV0,
  type X402ReceiptBinding,
  type BuildGistPublicationManifestParams,
} from '../../../../core/src/export/GistPublicationManifest';
