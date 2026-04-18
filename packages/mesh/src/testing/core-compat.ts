// Test-only compatibility bridge for mesh package tests that historically
// imported runtime symbols from @holoscript/core.
//
// We first re-export the real core package so mesh internals still receive
// utilities like `logger`, then layer mesh runtime exports on top so legacy
// mesh tests can instantiate mesh classes through the old core import path.

export * from '../../../core/src/index';
export * from '../index';

// High-frequency sync tests expect the interpolation-oriented JitterBuffer,
// not the packet reordering JitterBuffer exported by ./network.
export { JitterBuffer } from '../sync/HighFrequencySync';
