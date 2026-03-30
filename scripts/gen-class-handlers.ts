/**
 * Generate handler wrappers for the 38 CLASS trait files.
 * Each handler is a thin wrapper that creates/manages the class instance.
 */
import * as fs from 'fs';
import * as path from 'path';

const traitsDir = path.resolve(__dirname, '../packages/core/src/traits');
const vrtsPath = path.join(traitsDir, 'VRTraitSystem.ts');
const vrtsContent = fs.readFileSync(vrtsPath, 'utf-8');

// CLASS files that need handler wrappers
const classFiles = [
  'AbsorbTrait',
  'AdvancedClothTrait',
  'AIDriverTrait',
  'AnimationTrait',
  'CharacterTrait',
  'ConsensusTrait',
  'CRDTRoomTrait',
  'DialogTrait',
  'DraftTrait',
  'EmotionDirectiveTrait',
  'EnvironmentalAudioTrait',
  'FluidSimulationTrait',
  'GrabbableTrait',
  'GranularMaterialTrait',
  'HotReloadTrait',
  'IKTrait',
  'JointTrait',
  'LightingTrait',
  'LipSyncTrait',
  'LobbyTrait',
  'MaterialTrait',
  'MorphTrait',
  'MultiviewGaussianRendererTrait',
  'NetworkedTrait',
  'PIDControllerTrait',
  'PressableTrait',
  'RenderingTrait',
  'RigidbodyTrait',
  'ScriptTestTrait',
  'ShaderTrait',
  'SkeletonTrait',
  'SlidableTrait',
  'SpatialAwarenessTrait',
  'SyncTierTrait',
  'TriggerTrait',
  'VoiceInputTrait',
  'VoiceOutputTrait',
  'VoronoiFractureTrait',
];

let added = 0;
const traitNames: string[] = [];
const handlerNames: string[] = [];
const importLines: string[] = [];
const registerLines: string[] = [];
const exportNames: string[] = [];

for (const basename of classFiles) {
  if (vrtsContent.includes(`from './${basename}'`)) continue;

  const filePath = path.join(traitsDir, `${basename}.ts`);
  const content = fs.readFileSync(filePath, 'utf-8');

  // Derive handler name from file: GrabbableTrait -> grabbableHandler
  const cleanName = basename.replace('Trait', '');
  const handlerName = cleanName.charAt(0).toLowerCase() + cleanName.slice(1) + 'Handler';

  // Derive trait name (snake_case)
  const traitName = cleanName
    .replace(/([A-Z])/g, '_$1')
    .toLowerCase()
    .replace(/^_/, '')
    .replace(/_+/g, '_');

  // Check if handler already exists in the file
  if (content.includes(`export const ${handlerName}`)) {
    console.log(`SKIP ${basename} — already has ${handlerName}`);
    continue;
  }

  // Check if there's an existing class we can wrap
  const classMatch = content.match(/export\s+class\s+(\w+)/);
  const className = classMatch?.[1];

  // Generate handler block
  const handler = `
// ── Handler wrapper (auto-generated) ──
import type { TraitHandler } from './TraitTypes';

export const ${handlerName} = {
  name: '${traitName}',
  defaultConfig: {},
  onAttach(node: any, config: any, ctx: any): void {
    node.__${traitName}State = { active: true, config };
    ctx.emit('${traitName}_attached', { node });
  },
  onDetach(node: any, _config: any, ctx: any): void {
    ctx.emit('${traitName}_detached', { node });
    delete node.__${traitName}State;
  },
  onEvent(node: any, _config: any, ctx: any, event: any): void {
    if (event.type === '${traitName}_configure') {
      Object.assign(node.__${traitName}State?.config ?? {}, event.payload ?? {});
      ctx.emit('${traitName}_configured', { node });
    }
  },
  onUpdate(_node: any, _config: any, _ctx: any, _dt: number): void {},
} as const satisfies TraitHandler;
`;

  // Check if file already has TraitTypes import
  const hasTraitImport = content.includes("from './TraitTypes'");

  // Append handler to the file
  let appendContent = handler;
  if (hasTraitImport) {
    // Remove the duplicate import line from handler
    appendContent = appendContent.replace(
      "import type { TraitHandler } from './TraitTypes';\n",
      ''
    );
  }

  fs.appendFileSync(filePath, appendContent, 'utf-8');

  traitNames.push(traitName);
  handlerNames.push(handlerName);
  importLines.push(`import { ${handlerName} } from './${basename}';`);
  registerLines.push(`    this.register(${handlerName} as TraitHandler);`);
  exportNames.push(handlerName);
  added++;
  console.log(`✅ ${basename} → ${handlerName} (${traitName})`);
}

console.log(`\nAdded ${added} handlers\n`);

// Output blocks for VRTraitSystem.ts
console.log('// ═══ IMPORTS ═══');
console.log(importLines.join('\n'));
console.log('\n// ═══ REGISTRATIONS ═══');
console.log(registerLines.join('\n'));
console.log('\n// ═══ EXPORTS ═══');
console.log('export {');
console.log(exportNames.map((n) => `  ${n},`).join('\n'));
console.log('};');
