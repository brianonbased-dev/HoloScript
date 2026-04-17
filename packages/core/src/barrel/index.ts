/**
 * Public API composition for `@holoscript/core`.
 * Split across barrels so the root `index.ts` does not pull the entire graph through one file.
 */

export * from '../legacy-exports';

export * from './hsplus-public-types';

export * from './constants';
export * from './runtime-env';

export * from './exports-core';
export * from './exports-semantics-diff-wasm';
export * from './exports-visual-through-v43';
export * from './exports-graphql-safety';

// Platform / XR (split so culture + agent exports stay in original order)
export * from '../platforms/conditional-modality';
export * from './culture-agents';
export * from '../platforms/cross-reality';

export * from './marketplace';
export * from './hololand-runtime';
export * from './material-io-pipeline';
export * from './trait-stdlib-interop';
export * from './compiler-plugins-crypto';
export * from './registry-deploy-events';

// Agent extensions (ISwarmConfig, ISwarmResult, IAgentExtension, etc.)
export * from '../extensions';

// Worker layer exports
export * from '../worker/CompilerWorkerProxy';
export * from '../worker/LSPWorkerProtocol';
