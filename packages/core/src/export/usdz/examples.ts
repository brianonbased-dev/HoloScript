/**
 * USDZ Export Examples
 *
 * Example usage patterns for USDZ export functionality
 */

import { USDZExporter, type IUSDZExportOptions } from './USDZExporter';
import {
  createEmptySceneGraph,
  createDefaultMaterial,
  createEmptyNode,
  type ISceneGraph,
  type IMesh,
} from '../SceneGraph';

// ============================================================================
// Example 1: Basic USDZ Export
// ============================================================================

export async function example1_BasicExport(): Promise<void> {
  console.log('Example 1: Basic USDZ Export');

  // Create scene graph
  const sceneGraph = createEmptySceneGraph('BasicScene');

  // Create a simple material
  const material = createDefaultMaterial('mat1', 'RedMaterial');
  material.baseColor = [1, 0, 0, 1]; // Red
  material.metallic = 0.5;
  material.roughness = 0.3;
  sceneGraph.materials.push(material);

  // Export to USDZ
  const exporter = new USDZExporter();
  const result = await exporter.export(sceneGraph);

  console.log(`Exported ${result.stats.usdzSize} bytes in ${result.stats.exportTime}ms`);
  console.log(`Prims: ${result.stats.primCount}, Materials: ${result.stats.materialCount}`);

  // Save to file (Node.js)
  if (typeof process !== 'undefined') {
    const fs = await import('fs');
    fs.writeFileSync('output/basic.usdz', Buffer.from(result.usdz));
    console.log('Saved to output/basic.usdz');
  }
}

// ============================================================================
// Example 2: AR Quick Look with Floor Placement
// ============================================================================

export async function example2_ARFloorPlacement(): Promise<void> {
  console.log('Example 2: AR Quick Look with Floor Placement');

  const sceneGraph = createEmptySceneGraph('ARFloorObject');

  // Create material
  const material = createDefaultMaterial('mat1', 'GlossyBlue');
  material.baseColor = [0.2, 0.4, 1, 1]; // Blue
  material.metallic = 0.9;
  material.roughness = 0.1;
  sceneGraph.materials.push(material);

  // Export with AR options
  const options: IUSDZExportOptions = {
    placementMode: 'floor',
    lookAtCamera: false,
    enableOcclusion: true,
    allowContentScaling: true,
    canonicalCameraDistance: 2.0,
    materialQuality: 'high',
  };

  const exporter = new USDZExporter(options);
  const result = await exporter.export(sceneGraph);

  console.log('AR metadata:', result.stage.customLayerData?.arQuickLook);

  // In browser, create download link
  if (typeof window !== 'undefined') {
    const blob = new Blob([result.usdz], { type: 'model/vnd.usdz+zip' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'ar-floor-object.usdz';
    link.rel = 'ar';
    document.body.appendChild(link);
    console.log('AR Quick Look link created');
  }
}

// ============================================================================
// Example 3: Wall-Mounted AR Object
// ============================================================================

export async function example3_WallMountedAR(): Promise<void> {
  console.log('Example 3: Wall-Mounted AR Object');

  const sceneGraph = createEmptySceneGraph('WallArt');

  // Create frame material (gold)
  const frameMaterial = createDefaultMaterial('frame', 'GoldFrame');
  frameMaterial.baseColor = [1, 0.8, 0.2, 1];
  frameMaterial.metallic = 1.0;
  frameMaterial.roughness = 0.2;
  sceneGraph.materials.push(frameMaterial);

  // Create canvas material (white)
  const canvasMaterial = createDefaultMaterial('canvas', 'Canvas');
  canvasMaterial.baseColor = [0.95, 0.95, 0.95, 1];
  canvasMaterial.metallic = 0.0;
  canvasMaterial.roughness = 0.8;
  sceneGraph.materials.push(canvasMaterial);

  // Export with wall placement
  const options: IUSDZExportOptions = {
    placementMode: 'wall',
    lookAtCamera: false, // Stay flat against wall
    enableOcclusion: true,
    allowContentScaling: false, // Fixed size
    canonicalCameraDistance: 1.5,
    metersPerUnit: 1.0,
  };

  const exporter = new USDZExporter(options);
  const result = await exporter.export(sceneGraph);

  console.log(`Wall art exported: ${result.stats.materialCount} materials`);
}

// ============================================================================
// Example 4: Interactive Tabletop Object
// ============================================================================

export async function example4_TabletopInteractive(): Promise<void> {
  console.log('Example 4: Interactive Tabletop Object');

  const sceneGraph = createEmptySceneGraph('TabletopGame');

  // Create scene hierarchy
  const boardNode = createEmptyNode('board', 'GameBoard');
  boardNode.transform.scale = { x: 0.5, y: 0.01, z: 0.5 }; // Flat board
  sceneGraph.root.children.push(boardNode);

  // Create pieces (simplified)
  for (let i = 0; i < 4; i++) {
    const piece = createEmptyNode(`piece${i}`, `Piece${i}`);
    piece.transform.position = {
      x: (i % 2) * 0.1 - 0.05,
      y: 0.02,
      z: Math.floor(i / 2) * 0.1 - 0.05,
    };
    piece.transform.scale = { x: 0.03, y: 0.03, z: 0.03 };
    boardNode.children.push(piece);
  }

  // Material for board
  const boardMaterial = createDefaultMaterial('board', 'Checkerboard');
  boardMaterial.baseColor = [0.8, 0.7, 0.5, 1];
  boardMaterial.roughness = 0.6;
  sceneGraph.materials.push(boardMaterial);

  // Material for pieces
  const pieceMaterial = createDefaultMaterial('pieces', 'GamePieces');
  pieceMaterial.baseColor = [0.1, 0.1, 0.1, 1];
  pieceMaterial.metallic = 0.8;
  pieceMaterial.roughness = 0.2;
  sceneGraph.materials.push(pieceMaterial);

  // Export for table placement
  const options: IUSDZExportOptions = {
    placementMode: 'table',
    lookAtCamera: true, // Face the player
    enableOcclusion: true,
    allowContentScaling: true,
    canonicalCameraDistance: 1.0,
  };

  const exporter = new USDZExporter(options);
  const result = await exporter.export(sceneGraph);

  console.log(`Game board exported with ${result.stats.primCount} prims`);
}

// ============================================================================
// Example 5: Multi-Material Complex Object
// ============================================================================

export async function example5_MultiMaterialObject(): Promise<void> {
  console.log('Example 5: Multi-Material Complex Object');

  const sceneGraph = createEmptySceneGraph('ComplexObject');

  // Create diverse materials
  const materials = [
    { id: 'mat1', name: 'Plastic', color: [0.9, 0.2, 0.2, 1], metallic: 0.0, roughness: 0.5 },
    { id: 'mat2', name: 'Metal', color: [0.7, 0.7, 0.7, 1], metallic: 1.0, roughness: 0.3 },
    { id: 'mat3', name: 'Rubber', color: [0.1, 0.1, 0.1, 1], metallic: 0.0, roughness: 0.9 },
    { id: 'mat4', name: 'Glass', color: [0.9, 0.9, 1.0, 0.3], metallic: 0.0, roughness: 0.05 },
  ];

  for (const mat of materials) {
    const material = createDefaultMaterial(mat.id, mat.name);
    material.baseColor = mat.color as [number, number, number, number];
    material.metallic = mat.metallic;
    material.roughness = mat.roughness;

    if (mat.color[3] < 1) {
      material.alphaMode = 'blend';
    }

    sceneGraph.materials.push(material);
  }

  // Export with high quality settings
  const options: IUSDZExportOptions = {
    placementMode: 'any',
    materialQuality: 'high',
    enableOcclusion: true,
    allowContentScaling: true,
  };

  const exporter = new USDZExporter(options);
  const result = await exporter.export(sceneGraph);

  console.log(
    `Complex object: ${result.stats.materialCount} materials, ${result.stats.usdzSize} bytes`
  );
}

// ============================================================================
// Example 6: Performance Comparison
// ============================================================================

export async function example6_PerformanceComparison(): Promise<void> {
  console.log('Example 6: Performance Comparison');

  const sceneGraph = createEmptySceneGraph('PerformanceTest');

  // Add many materials to test performance
  for (let i = 0; i < 50; i++) {
    const material = createDefaultMaterial(`mat${i}`, `Material${i}`);
    material.baseColor = [Math.random(), Math.random(), Math.random(), 1];
    material.metallic = Math.random();
    material.roughness = Math.random();
    sceneGraph.materials.push(material);
  }

  // Test different quality settings
  const qualities: Array<'draft' | 'standard' | 'high'> = ['draft', 'standard', 'high'];

  for (const quality of qualities) {
    const options: IUSDZExportOptions = { materialQuality: quality };
    const exporter = new USDZExporter(options);

    const startTime = performance.now();
    const result = await exporter.export(sceneGraph);
    const endTime = performance.now();

    console.log(
      `${quality}: ${result.stats.usdzSize} bytes in ${(endTime - startTime).toFixed(2)}ms`
    );
  }
}

// ============================================================================
// Example 7: Coordinate System Conversion
// ============================================================================

export async function example7_CoordinateConversion(): Promise<void> {
  console.log('Example 7: Coordinate System Conversion');

  const sceneGraph = createEmptySceneGraph('CoordinateTest');

  // Create object with specific transforms
  const obj = createEmptyNode('obj', 'TestObject');
  obj.transform.position = { x: 1, y: 2, z: 3 };
  obj.transform.rotation = { x: 0, y: 0.707, z: 0, w: 0.707 }; // 90° Y rotation
  obj.transform.scale = { x: 2, y: 2, z: 2 };
  sceneGraph.root.children.push(obj);

  // Test Y-up (default)
  const exporterY = new USDZExporter({ upAxis: 'Y' });
  const resultY = await exporterY.export(sceneGraph);
  console.log('Y-up export:', resultY.stage.metadata.upAxis);

  // Test Z-up (for some 3D tools)
  const exporterZ = new USDZExporter({ upAxis: 'Z' });
  const resultZ = await exporterZ.export(sceneGraph);
  console.log('Z-up export:', resultZ.stage.metadata.upAxis);
}

// ============================================================================
// Example 8: Batch Export
// ============================================================================

export async function example8_BatchExport(): Promise<void> {
  console.log('Example 8: Batch Export Multiple Scenes');

  const scenes = [
    { name: 'Red', color: [1, 0, 0, 1] },
    { name: 'Green', color: [0, 1, 0, 1] },
    { name: 'Blue', color: [0, 0, 1, 1] },
  ];

  const results: Array<{ name: string; size: number; time: number }> = [];

  for (const scene of scenes) {
    const sceneGraph = createEmptySceneGraph(scene.name);

    const material = createDefaultMaterial('mat', scene.name);
    material.baseColor = scene.color as [number, number, number, number];
    sceneGraph.materials.push(material);

    const exporter = new USDZExporter();
    const result = await exporter.export(sceneGraph);

    results.push({
      name: scene.name,
      size: result.stats.usdzSize,
      time: result.stats.exportTime,
    });
  }

  console.log('Batch export results:');
  console.table(results);
}

// ============================================================================
// Example 9: Debug USD Stage
// ============================================================================

export async function example9_DebugStage(): Promise<void> {
  console.log('Example 9: Debug USD Stage Structure');

  const sceneGraph = createEmptySceneGraph('DebugScene');

  // Create some content
  const material = createDefaultMaterial('mat', 'TestMaterial');
  sceneGraph.materials.push(material);

  const node = createEmptyNode('node', 'TestNode');
  sceneGraph.root.children.push(node);

  const exporter = new USDZExporter();
  const result = await exporter.export(sceneGraph);

  // Traverse and print USD structure
  function printPrim(prim: any, depth = 0) {
    const indent = '  '.repeat(depth);
    console.log(`${indent}${prim.type}: ${prim.name} (${prim.path})`);

    if (prim.attributes?.length > 0) {
      console.log(`${indent}  Attributes: ${prim.attributes.length}`);
    }

    if (prim.children?.length > 0) {
      for (const child of prim.children) {
        printPrim(child, depth + 1);
      }
    }
  }

  console.log('USD Stage Structure:');
  for (const prim of result.stage.prims) {
    printPrim(prim);
  }
}

// ============================================================================
// Example 10: Integration with GLTFExporter
// ============================================================================

export async function example10_GLTFIntegration(): Promise<void> {
  console.log('Example 10: GLTF + USDZ Dual Export');

  const sceneGraph = createEmptySceneGraph('DualExport');

  const material = createDefaultMaterial('mat', 'SharedMaterial');
  material.baseColor = [0.5, 0.5, 1, 1];
  material.metallic = 0.7;
  material.roughness = 0.4;
  sceneGraph.materials.push(material);

  // Export to GLTF (requires GLTFExporter)
  try {
    const { GLTFExporter } = await import('../gltf/GLTFExporter');

    const gltfExporter = new GLTFExporter({ binary: true });
    const gltfResult = await gltfExporter.export(sceneGraph);

    // Export to USDZ
    const usdzResult = await gltfExporter.exportToUSDZ(sceneGraph, {
      placementMode: 'floor',
      materialQuality: 'high',
    });

    console.log('Dual export comparison:');
    console.log(`GLTF (GLB): ${gltfResult.stats.glbSize} bytes`);
    console.log(`USDZ: ${usdzResult.stats.usdzSize} bytes`);
    console.log(`Ratio: ${(usdzResult.stats.usdzSize / gltfResult.stats.glbSize).toFixed(2)}x`);
  } catch (err) {
    console.error('GLTFExporter not available:', err);
  }
}

// ============================================================================
// Run All Examples
// ============================================================================

export async function runAllExamples(): Promise<void> {
  console.log('='.repeat(60));
  console.log('USDZ Export Examples');
  console.log('='.repeat(60));

  const examples = [
    example1_BasicExport,
    example2_ARFloorPlacement,
    example3_WallMountedAR,
    example4_TabletopInteractive,
    example5_MultiMaterialObject,
    example6_PerformanceComparison,
    example7_CoordinateConversion,
    example8_BatchExport,
    example9_DebugStage,
    example10_GLTFIntegration,
  ];

  for (const example of examples) {
    try {
      console.log('\n' + '-'.repeat(60));
      await example();
    } catch (err) {
      console.error('Example failed:', err);
    }
  }

  console.log('\n' + '='.repeat(60));
  console.log('All examples completed');
  console.log('='.repeat(60));
}

// Auto-run if executed directly
if (typeof require !== 'undefined' && require.main === module) {
  runAllExamples().catch(console.error);
}
