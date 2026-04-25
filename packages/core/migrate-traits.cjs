const fs = require('fs');
const path = require('path');

const coreDir = 'C:\\Users\\Josep\\Documents\\GitHub\\HoloScript\\packages\\core';
const engineDir = 'C:\\Users\\Josep\\Documents\\GitHub\\HoloScript\\packages\\engine';

const filesToMove = [
  'src/tools/MaterialEditor.ts',
  'src/tools/SceneInspector.ts',
  'src/traits/ChoreographyTrait.ts',
  'src/traits/DeformableTerrainTrait.ts',
  'src/traits/EmotionalVoiceTrait.ts',
  'src/traits/FlowFieldTrait.ts',
  'src/traits/FluidTrait.ts',
  'src/traits/GPUPhysicsTrait.ts',
  'src/traits/GodRaysTrait.ts',
  'src/traits/HandMenuTrait.ts',
  'src/traits/MQTTSinkTrait.ts',
  'src/traits/MQTTSourceTrait.ts',
  'src/traits/NetworkedAvatarTrait.ts',
  'src/traits/OrbitalTrait.ts',
  'src/traits/ScriptTestTrait.ts',
  'src/traits/ScrollableTrait.ts',
  'src/traits/SoftBodyTrait.ts',
  'src/traits/SpatialAwarenessTrait.ts',
  'src/traits/SpatialConstraintTraits.ts',
  'src/traits/SpatiotemporalTraits.ts',
  'src/traits/UserMonitorTrait.ts',
  'src/traits/VolumetricCloudsTrait.ts',
  'src/traits/WeatherHubTrait.ts',
];

const testFilesToMove = [
  'src/traits/MQTTSinkTrait.test.ts',
  'src/traits/MQTTSourceTrait.test.ts',
  'src/traits/SpatialAwarenessTrait.test.ts',
  'src/traits/__tests__/ChoreographyTrait.prod.test.ts',
  'src/traits/__tests__/ChoreographyTrait.test.ts',
  'src/traits/__tests__/EmotionalVoiceTrait.prod.test.ts',
  'src/traits/__tests__/EmotionalVoiceTrait.test.ts',
  'src/traits/__tests__/FlowFieldTrait.prod.test.ts',
  'src/traits/__tests__/FlowFieldTrait.test.ts',
  'src/traits/__tests__/GPUPhysicsTrait.prod.test.ts',
  'src/traits/__tests__/GPUPhysicsTrait.test.ts',
  'src/traits/__tests__/HandMenuTrait.prod.test.ts',
  'src/traits/__tests__/HandMenuTrait.test.ts',
  'src/traits/__tests__/IoTPipeline.integration.test.ts',
  'src/traits/__tests__/MQTTSinkTrait.prod.test.ts',
  'src/traits/__tests__/MQTTSinkTrait.test.ts',
  'src/traits/__tests__/MQTTSourceTrait.prod.test.ts',
  'src/traits/__tests__/MQTTSourceTrait.test.ts',
  'src/traits/__tests__/MultiplayerNPCScene.integration.test.ts',
  'src/traits/__tests__/NetworkedAvatarTrait.prod.test.ts',
  'src/traits/__tests__/NetworkedAvatarTrait.test.ts',
  'src/traits/__tests__/OrbitalTrait.prod.test.ts',
  'src/traits/__tests__/OrbitalTrait.test.ts',
  'src/traits/__tests__/SoftBodyTrait.test.ts',
  'src/traits/__tests__/SpatialAwarenessTrait.prod.test.ts',
  'src/traits/__tests__/SpatialAwarenessTrait.test.ts',
  'src/traits/__tests__/UserMonitorTrait.test.ts',
];

function updateImports(filePath) {
  let content = fs.readFileSync(filePath, 'utf8');
  
  // General trait types to core
  content = content.replace(/from\s+['"](?:\.\.\/)+traits\/TraitTypes['"]/g, "from '@holoscript/core'");
  content = content.replace(/from\s+['"](?:\.\.\/)+types(?:\/HoloScriptPlus)?['"]/g, "from '@holoscript/core'");
  content = content.replace(/from\s+['"]\.\/TraitTypes['"]/g, "from '@holoscript/core'");
  content = content.replace(/from\s+['"]\.\.\/types['"]/g, "from '@holoscript/core'");
  
  // Specific traits that we might import
  content = content.replace(/from\s+['"]\.\/([a-zA-Z0-9]+Trait)['"]/g, (match, p1) => {
    // If it's importing a trait that we moved, it should be a relative import in engine.
    // If it's importing a trait that stayed in core, it should be from @holoscript/core.
    const moved = filesToMove.some(f => f.includes(p1 + '.ts'));
    if (moved) return match; // Keep relative
    return `from '@holoscript/core'`;
  });

  fs.writeFileSync(filePath, content);
}

for (const file of [...filesToMove, ...testFilesToMove]) {
  const src = path.join(coreDir, file);
  const dest = path.join(engineDir, file);
  
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  
  if (fs.existsSync(src)) {
    fs.renameSync(src, dest);
    updateImports(dest);
    console.log(`Moved ${file}`);
  }
}

// Now we need to remove the imports of these traits from core/src/traits/VRTraitSystem.ts
const systemPath = path.join(coreDir, 'src/traits/VRTraitSystem.ts');
if (fs.existsSync(systemPath)) {
  let content = fs.readFileSync(systemPath, 'utf8');
  for (const file of filesToMove) {
    const baseName = path.basename(file, '.ts');
    // Regex to remove the import line
    const importRegex = new RegExp(`import\\s+\\{[^}]+\\}\\s+from\\s+['"]\\.\\/${baseName}['"];?\\n`, 'g');
    content = content.replace(importRegex, '');
    
    // Convert baseName (e.g. GPUPhysicsTrait) to handler name (e.g. gpuPhysicsHandler)
    let handlerName = baseName.replace('Trait', 'Handler');
    handlerName = handlerName.charAt(0).toLowerCase() + handlerName.slice(1);
    
    // Sometimes there are multiple handlers from one file, like structuralFEMHandler
    // This script might miss some if they have different names.
  }
  
  // Let's just remove the exact lines we know about
  const handlersToRemove = [
    'choreographyHandler', 'deformableTerrainHandler', 'emotionalVoiceHandler',
    'flowFieldHandler', 'fluidHandler', 'gpuPhysicsHandler', 'godRaysHandler',
    'handMenuHandler', 'mqttSinkHandler', 'mqttSourceHandler', 'networkedAvatarHandler',
    'orbitalHandler', 'scriptTestHandler', 'scrollableHandler', 'softBodyHandler',
    'spatialAwarenessHandler', 'userMonitorHandler', 'volumetricCloudsHandler',
    'weatherHubHandler', 'thermalSimulationHandler', 'structuralFEMHandler', 
    'hydraulicPipeHandler', 'saturationThermalHandler', 'saturationMoistureHandler', 
    'saturationPressureHandler', 'saturationElectricalHandler', 'saturationChemicalHandler', 
    'saturationStructuralHandler', 'phaseTransitionHandler', 'thresholdWarningHandler', 
    'thresholdCriticalHandler', 'thresholdRecoveryHandler', 'scalarFieldOverlayHandler'
  ];
  
  for (const handler of handlersToRemove) {
    const reg = new RegExp(`^.*${handler}.*\\n`, 'gm');
    content = content.replace(reg, '');
  }
  
  fs.writeFileSync(systemPath, content);
  console.log('Updated VRTraitSystem.ts');
}

// Update core/src/traits/index.ts
const indexPath = path.join(coreDir, 'src/traits/index.ts');
if (fs.existsSync(indexPath)) {
  let content = fs.readFileSync(indexPath, 'utf8');
  for (const file of filesToMove) {
    const baseName = path.basename(file, '.ts');
    const importRegex = new RegExp(`export\\s+\\*\\s+from\\s+['"]\\.\\/${baseName}['"];?\\n`, 'g');
    content = content.replace(importRegex, '');
    
    const namedExportRegex = new RegExp(`export\\s+\\{[^}]+\\}\\s+from\\s+['"]\\.\\/${baseName}['"];?\\n`, 'g');
    content = content.replace(namedExportRegex, '');
  }
  fs.writeFileSync(indexPath, content);
  console.log('Updated core/src/traits/index.ts');
}
