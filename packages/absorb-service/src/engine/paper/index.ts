/**
 * Paper/doc ingest surface (A19): Markdown + LaTeX structure, claim ledger,
 * claim graph ingest + link queries, local cascade replay.
 */
export * from './markdownStructure';
export * from './texStructure';
export * from './claimLedger';
export * from './claimIngest';
export * from './cascadeReplay';
export * from '../AnswerProvenance';
export { PaperAdapter, makeDocStubTree } from '../adapters/PaperAdapter';
export { PaperTexAdapter } from '../adapters/PaperTexAdapter';
export { CodebaseGraph } from '../CodebaseGraph';
export { ClaimNetworkGraph } from '../ClaimNetworkGraph';export * from './fsLoaders';
