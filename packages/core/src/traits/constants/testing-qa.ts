/**
 * Testing / QA Traits
 *
 * Test doubles, fixtures, and quality assurance primitives.
 *
 * @version 1.0.0
 */
export const TESTING_QA_TRAITS = [
  'mock', // Mock object / function creation
  'fixture', // Test fixture / data setup
  'snapshot_test', // Snapshot comparison testing
  'load_test', // Load / stress test runner
  'chaos_test', // Chaos engineering fault injection
] as const;

export type TestingQATraitName = (typeof TESTING_QA_TRAITS)[number];
