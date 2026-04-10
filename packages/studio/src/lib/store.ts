/**
 * Backwards-compatibility shim.
 *
 * The canonical stores live in ./stores/ (plural).
 * Several hooks and scenario tests still import from '../lib/store' (singular).
 * This re-export keeps those imports working without a mass-rename.
 */
export * from './stores';
