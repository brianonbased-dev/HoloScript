export const FIRST_SCENE_PROOF = {
  name: 'Unity Gap First Scene Proof',
  source_path: 'packages/studio/src/lib/studio/first-scene/unity-gap-starter.holo',
  studio_entry: '/api/studio/quickstart',
  wizard_component: 'packages/studio/src/components/wizard/QuickStartWizard.tsx',
  profiler_panel: 'packages/studio/src/lib/studio/panels/profiler.holo',
  asset_pack_endpoint: '/api/asset-packs',
  asset_pack_native_surface: 'packages/studio/src/app/api/asset-packs/asset_packs_route.hsplus',
  asset_pack_panel: 'packages/studio/src/lib/studio/panels/assetPack.holo',
  r3f_performance_receipt: 'packages/r3f-renderer/src/hooks/usePerformanceRegression.hsplus',
  hologate_scope:
    'HoloGate is a docs umbrella; this proof uses concrete HoloKey, umbrella routing, triad receipt, profiler, asset-pack, and R3F performance surfaces.',
  proof_markers: [
    'HoloKey custody',
    'umbrella routing',
    'triad receipt',
    'native profiler panel',
    'asset pack loop',
    'R3F performance regression receipt',
  ],
} as const;
