import type { CompilerWalkthroughData } from '../../components/CompilerWalkthroughTemplate';

export const babylonData: CompilerWalkthroughData = {
  compilerTarget: 'Babylon.js TypeScript',
  outputLanguage: 'TypeScript',
  holoSteps: [
    {
      title: 'Write the .holo scene',
      description: 'A scene with a mesh, material, light, and camera — targeting WebGL output.',
      lines: [
        { content: 'scene VirtualGallery {', highlight: true },
        { content: '  object Artwork {' },
        { content: '    mesh: Plane { width: 2, height: 3 }' },
        { content: '    material: PBRMaterial { albedo: #f0e6d3, roughness: 0.4 }' },
        { content: '    position: [0, 1.5, -3]' },
        { content: '    traits: [Interactable]' },
        { content: '  }' },
        { content: '  light: DirectionalLight { intensity: 0.8, direction: [0, -1, 0.5] }' },
        { content: '  camera: PerspectiveCamera { fov: 75, position: [0, 1.5, 5] }' },
        { content: '}' },
      ],
    },
    {
      title: 'Invoke the Babylon compiler',
      description:
        'BabylonCompiler outputs a createScene() function — paste it into any Babylon.js app.',
      lines: [
        {
          content: 'import { BabylonCompiler } from "@holoscript/core/compilers"',
          highlight: true,
        },
        { content: '' },
        { content: 'const compiler = new BabylonCompiler({', highlight: true },
        { content: "  functionName: 'createScene'," },
        { content: '  useESM: true,' },
        { content: '})' },
        {
          content: 'const tsCode = compiler.compile(composition)',
          annotation: '→ string',
          highlight: true,
        },
      ],
    },
  ],
  outputSteps: [
    {
      title: 'Generated TypeScript — imports & function',
      description:
        'A self-contained createScene() function, importable into any Babylon.js project.',
      lines: [
        { content: 'import * as BABYLON from "@babylonjs/core"', highlight: true },
        { content: 'import "@babylonjs/loaders/glTF"', dim: true },
        { content: '' },
        { content: 'export function createScene(', highlight: true },
        { content: '  engine: BABYLON.Engine,' },
        { content: '  canvas: HTMLCanvasElement' },
        { content: '): BABYLON.Scene {' },
        { content: '  const scene = new BABYLON.Scene(engine)', type: 'added' },
      ],
    },
    {
      title: 'Generated TypeScript — mesh & camera',
      description: 'MeshBuilder, PBRMaterial, and ArcRotateCamera wired together.',
      lines: [
        { content: '  const artwork = BABYLON.MeshBuilder.CreatePlane(', highlight: true },
        { content: "    'Artwork', { width: 2, height: 3 }, scene", type: 'added' },
        { content: '  )' },
        {
          content: "  const mat = new BABYLON.PBRMaterial('ArtworkMat', scene)",
          type: 'added',
          annotation: 'PBR',
        },
        { content: '  mat.albedoColor = new BABYLON.Color3(0.94, 0.90, 0.83)', type: 'added' },
        { content: '  mat.roughness = 0.4', type: 'added' },
        { content: '  artwork.material = mat', type: 'added' },
        { content: '' },
        { content: '  const camera = new BABYLON.ArcRotateCamera(', highlight: true },
        { content: "    'Camera', 0, Math.PI/4, 5, BABYLON.Vector3.Zero(), scene" },
        { content: '  )' },
        { content: '  camera.fov = 75 * (Math.PI / 180)', type: 'added' },
        { content: '  camera.attachControl(canvas, true)', type: 'added' },
        { content: '  return scene', highlight: true },
        { content: '}' },
      ],
    },
  ],
};
