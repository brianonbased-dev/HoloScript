/**
 * Mock for @aztec/bb.js (Barretenberg WASM backend)
 *
 * The real module contains native WASM bindings that fail to load
 * in Node.js/jsdom test environments. This mock provides stubs
 * so @holoscript/core's ZkPrivateTrait can import it without errors.
 */
export const Barretenberg = {
  new: async () => ({
    destroy: () => {},
  }),
};
