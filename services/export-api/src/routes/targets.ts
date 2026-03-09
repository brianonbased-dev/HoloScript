/**
 * Targets Route
 *
 * GET /api/v1/targets - List available export targets.
 *
 * Publicly accessible (with authentication) list of all supported
 * HoloScript compilation targets.
 */

import { Router, type Request, type Response } from 'express';
import { authenticate } from '../middleware/authenticate.js';
import { authorize } from '../middleware/authorize.js';
import { SUPPORTED_TARGETS } from '../services/compileWorker.js';

export const targetsRouter = Router();

/** Target metadata */
interface TargetInfo {
  id: string;
  name: string;
  category: string;
  description: string;
  outputFormat: string;
  status: 'stable' | 'beta' | 'experimental';
}

const TARGET_METADATA: Record<string, Omit<TargetInfo, 'id'>> = {
  unity: { name: 'Unity', category: 'game-engine', description: 'Unity C# scripts and prefabs', outputFormat: '.unitypackage', status: 'stable' },
  unreal: { name: 'Unreal Engine', category: 'game-engine', description: 'Unreal Engine C++ and Blueprints', outputFormat: '.uasset', status: 'stable' },
  godot: { name: 'Godot', category: 'game-engine', description: 'Godot GDScript scenes', outputFormat: '.tscn', status: 'beta' },
  vrchat: { name: 'VRChat', category: 'social-vr', description: 'VRChat world and avatar SDK', outputFormat: '.unitypackage', status: 'stable' },
  openxr: { name: 'OpenXR', category: 'xr-runtime', description: 'OpenXR-compatible binaries', outputFormat: '.oxr', status: 'beta' },
  android: { name: 'Android', category: 'mobile', description: 'Android APK/AAB with ARCore', outputFormat: '.apk', status: 'beta' },
  ios: { name: 'iOS', category: 'mobile', description: 'iOS IPA with ARKit', outputFormat: '.ipa', status: 'beta' },
  visionos: { name: 'visionOS', category: 'spatial', description: 'Apple Vision Pro app', outputFormat: '.app', status: 'experimental' },
  ar: { name: 'WebAR', category: 'web', description: 'WebAR experience (WebXR)', outputFormat: '.html', status: 'stable' },
  babylon: { name: 'Babylon.js', category: 'web', description: 'Babylon.js scene export', outputFormat: '.js', status: 'stable' },
  webgpu: { name: 'WebGPU', category: 'web', description: 'Raw WebGPU compute/render', outputFormat: '.js', status: 'experimental' },
  r3f: { name: 'React Three Fiber', category: 'web', description: 'R3F React components', outputFormat: '.tsx', status: 'stable' },
  wasm: { name: 'WebAssembly', category: 'web', description: 'WASM module export', outputFormat: '.wasm', status: 'beta' },
  playcanvas: { name: 'PlayCanvas', category: 'web', description: 'PlayCanvas project export', outputFormat: '.json', status: 'beta' },
  urdf: { name: 'URDF', category: 'robotics', description: 'Unified Robot Description Format', outputFormat: '.urdf', status: 'stable' },
  sdf: { name: 'SDF', category: 'robotics', description: 'Simulation Description Format (Gazebo)', outputFormat: '.sdf', status: 'stable' },
  usd: { name: 'USD', category: 'interchange', description: 'Universal Scene Description', outputFormat: '.usd', status: 'stable' },
  usdz: { name: 'USDZ', category: 'interchange', description: 'USDZ for AR Quick Look', outputFormat: '.usdz', status: 'stable' },
  dtdl: { name: 'DTDL', category: 'iot', description: 'Digital Twins Definition Language', outputFormat: '.json', status: 'experimental' },
  vrr: { name: 'VR Ready', category: 'deployment', description: 'Optimized VR-ready bundle', outputFormat: '.vrr', status: 'beta' },
};

/**
 * GET /api/v1/targets
 * List all supported export targets with metadata.
 */
targetsRouter.get(
  '/',
  authenticate,
  authorize('targets:list'),
  (_req: Request, res: Response) => {
    const targets: TargetInfo[] = SUPPORTED_TARGETS.map((id) => ({
      id,
      ...(TARGET_METADATA[id] ?? {
        name: id,
        category: 'unknown',
        description: `Export target: ${id}`,
        outputFormat: '.*',
        status: 'experimental' as const,
      }),
    }));

    const categories = [...new Set(targets.map((t) => t.category))].sort();

    res.status(200).json({
      targets,
      count: targets.length,
      categories,
      categorized: Object.fromEntries(
        categories.map((cat) => [cat, targets.filter((t) => t.category === cat)])
      ),
    });
  }
);
