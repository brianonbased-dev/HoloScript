import * as fs from 'fs';
import * as path from 'path';

export interface ImportOptions {
  engineType: 'unity' | 'unreal' | 'ros2';
  sourcePath: string;
  outputPath: string;
}

/**
 * Legacy flat `.holo` / composition trait references (pre–namespaced core barrel)
 * map to `PluginNamespace.trait` execution paths aligned with
 * `packages/core/src/traits/index.ts` (`export * as X from '@holoscript/...'`).
 */
export const LEGACY_FLAT_TRAIT_TO_NAMESPACED: Readonly<Record<string, string>> = {
  // @holoscript/plugin-film-vfx → FilmVFXPlugin
  shot_list: 'FilmVFXPlugin.shot_list',
  color_grade: 'FilmVFXPlugin.color_grade',
  dmx_lighting: 'FilmVFXPlugin.dmx_lighting',
  director_ai: 'FilmVFXPlugin.director_ai',
  virtual_production: 'FilmVFXPlugin.virtual_production',
  text_to_universe: 'FilmVFXPlugin.text_to_universe',
  // Legacy absorb ROS stub — RoboticsPlugin namespace in core
  robotic_joint: 'RoboticsPlugin.robotic_joint'
};

/**
 * Normalize a single trait token to namespaced envelope form.
 * Accepts tokens with or without leading `@`.
 */
export function toNamespacedTraitToken(token: string): string {
  const trimmed = token.trim().replace(/^@+/, '');
  return LEGACY_FLAT_TRAIT_TO_NAMESPACED[trimmed] ?? trimmed;
}

/**
 * Route source text through legacy → namespaced plugin envelope normalization.
 * This is intended for AST-loading / extraction paths before persistence.
 */
export function routeNamespacedPluginEnvelopes(source: string): string {
  return LegacyImporter.rewriteLegacyFlatTraits(source);
}

export class LegacyImporter {
  /**
   * Rewrite legacy flat plugin trait tokens to `Namespace.trait` form.
   * Handles `@trait`, `@"trait"`, `trait name="trait"`, and composition-style `@trait {`.
   */
  static rewriteLegacyFlatTraits(source: string): string {
    let out = source;

    for (const [flat, namespaced] of Object.entries(LEGACY_FLAT_TRAIT_TO_NAMESPACED)) {
      const ns = namespaced;

      // @flat or @"flat" / @'flat' → @Namespace.trait (not @flat.suffix)
      const atRe = new RegExp(`@(["']?)(${flat})\\1(?!\\.)`, 'g');
      out = out.replace(atRe, () => `@${ns}`);

      // XML-ish: name="flat" / name='flat' → name="@Namespace.trait"
      out = out.replace(
        new RegExp(`(\\bname\\s*=\\s*)(["'])(${flat})\\2(?!\\.)`, 'gi'),
        `$1$2@${ns}$2`
      );

      // JSON-ish / object literals: trait: "flat" or "trait": "flat"
      out = out.replace(
        new RegExp(`((?:\\btrait\\b|"trait")\\s*:\\s*)(["'])(${flat})\\2(?!\\.)`, 'gi'),
        `$1$2${ns}$2`
      );

      // key-style references: trait="@flat" or trait='@flat'
      out = out.replace(
        new RegExp(`((?:\\btrait\\b)\\s*=\\s*)(["'])@(${flat})\\2(?!\\.)`, 'gi'),
        `$1$2@${ns}$2`
      );
    }

    return out;
  }

  static async importProject(options: ImportOptions): Promise<string> {
    console.log(`[HoloMesh:Absorb] Starting one-click legacy import from ${options.engineType} project at ${options.sourcePath}`);
    
    // Abstract extraction logic
    let extractedSceneData = '';
    if (options.engineType === 'unity') {
      extractedSceneData = this.parseUnityYaml(options.sourcePath);
    } else if (options.engineType === 'unreal') {
      extractedSceneData = this.parseUnrealUAsset(options.sourcePath);
    } else if (options.engineType === 'ros2') {
      extractedSceneData = this.parseROS2URDF(options.sourcePath);
    }

    // Convert into .holo syntax
    let holoContent = `
# .holo (Auto-imported from ${options.engineType})
<scene>
  <node id="root">
    ${extractedSceneData}
  </node>
</scene>
    `.trim();

    holoContent = LegacyImporter.rewriteLegacyFlatTraits(holoContent);

    const finalPath = path.join(options.outputPath, 'imported_scene.holo');
    fs.mkdirSync(options.outputPath, { recursive: true });
    fs.writeFileSync(finalPath, holoContent, 'utf-8');
    
    console.log(`[HoloMesh:Absorb] Successfully compiled legacy ${options.engineType} data to ${finalPath}`);
    return finalPath;
  }

  private static parseUnityYaml(_p: string): string {
    // Stub: read .unity scene files and extract Transforms & MeshRenderers
    return `<mesh path="assets/unity_mesh.glb"/>\n    <transform x="0" y="0" z="0"/>`;
  }
  private static parseUnrealUAsset(_p: string): string {
    // Stub: read .umap or .uasset binary exports
    return `<mesh path="assets/unreal_mesh.glb"/>\n    <transform x="0" y="0" z="0"/>`;
  }
  private static parseROS2URDF(_p: string): string {
    // Stub: parse URDF XML links and joints into HoloScript traits
    return `<mesh path="assets/robot_link.glb"/>\n    <trait name="@robotic_joint" />`;
  }
}
