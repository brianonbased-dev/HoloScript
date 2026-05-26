import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

const traitBarrelPluginStub = fileURLToPath(
  new URL('./src/__tests__/trait-barrel-plugin-stub.ts', import.meta.url)
);

const traitBarrelPluginAliases = [
  '@holoscript/plugin-film-vfx',
  '@holoscript/alphafold-plugin',
  '@holoscript/plugin-banking-finance',
  '@holoscript/plugin-civil-engineering',
  '@holoscript/plugin-culture-keyword',
  '@holoscript/domain-plugin-template',
  '@holoscript/plugin-economic-primitives',
  '@holoscript/plugin-education-lms',
  '@holoscript/plugin-emergency-response',
  '@holoscript/plugin-fashion',
  '@holoscript/plugin-film3d-volumetrics',
  '@holoscript/plugin-fitness-wellness',
  '@holoscript/plugin-forensics',
  '@holoscript/plugin-geolocation-gis',
  '@holoscript/plugin-hr-workforce',
  '@holoscript/plugin-insurance',
  '@holoscript/plugin-legal-document',
  '@holoscript/plugin-manufacturing-qc',
  '@holoscript/medical-plugin',
  '@holoscript/plugin-neuroscience',
  '@holoscript/radio-astronomy-plugin',
  '@holoscript/plugin-restaurant',
  '@holoscript/plugin-retail-ecommerce',
  '@holoscript/robotics-plugin',
  '@holoscript/narupa-plugin',
  '@holoscript/plugin-threat-intelligence',
  '@holoscript/plugin-trait-audit',
  '@holoscript/plugin-travel-hospitality',
  '@holoscript/plugin-urban-planning',
  '@holoscript/plugin-wine-food-beverage',
  '@holoscript/plugin-wisdom-gotcha',
].map((find) => ({ find, replacement: traitBarrelPluginStub }));

export default defineConfig({
  resolve: {
    alias: traitBarrelPluginAliases,
  },
  test: {
    name: '@holoscript/holoscript-agent',
    root: '.',
    include: ['src/**/*.test.ts'],
    exclude: ['**/dist/**', '**/node_modules/**'],
    environment: 'node',
  },
});
