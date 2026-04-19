import * as fs from 'fs';
import * as path from 'path';
import { parseHolo, holoFactory, generateHoloSource } from '@holoscript/core';
import type { HoloObjectDecl } from '@holoscript/core';

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
    let extractedObjects: HoloObjectDecl[] = [];
    if (options.engineType === 'unity') {
      extractedObjects = this.parseUnityYaml(options.sourcePath);
    } else if (options.engineType === 'unreal') {
      extractedObjects = this.parseUnrealUAsset(options.sourcePath);
    } else if (options.engineType === 'ros2') {
      extractedObjects = this.parseROS2URDF(options.sourcePath);
    }

    const ast = holoFactory.composition(`imported_${options.engineType}_project`, [], [
      holoFactory.spatialGroup('root', extractedObjects)
    ]);

    let holoContent = generateHoloSource(ast);
    holoContent = `\n# .holo (Auto-imported from ${options.engineType})\n` + holoContent;
    holoContent = LegacyImporter.rewriteLegacyFlatTraits(holoContent);

    const finalPath = path.join(options.outputPath, 'imported_scene.holo');
    fs.mkdirSync(options.outputPath, { recursive: true });
    fs.writeFileSync(finalPath, holoContent, 'utf-8');

    console.log(
      `[HoloMesh:Absorb] Successfully compiled legacy ${options.engineType} data to ${finalPath}`
    );
    return finalPath;
  }

  /**
   * Parse the generated .holo content through `@holoscript/core` and
   * return a structured validation record. Exposed as a static method
   * so tests and callers can inspect it without re-running the full
   * import pipeline.
   */
  static validateHoloContent(content: string): {
    valid: boolean;
    parseErrors: string[];
  } {
    try {
      const result = parseHolo(content, { tolerant: true, locations: false });
      const errs = result.errors ?? [];
      return {
        valid: errs.length === 0 && result.ast != null,
        parseErrors: errs.map((e) => e.message ?? String(e)),
      };
    } catch (err) {
      return {
        valid: false,
        parseErrors: [err instanceof Error ? err.message : String(err)],
      };
    }
  }

  /**
   * Best-effort parse of Unity YAML scenes (`.unity`): extracts `Transform.m_LocalPosition` blocks.
   * If `p` is a directory, uses the first `.unity` file found.
   */
  private static parseUnityYaml(p: string): HoloObjectDecl[] {
    const defaultObj = [holoFactory.node('transform', [], { properties: [{ type: 'ObjectProperty', key: 'position', value: [0, 0, 0] }] })];
    try {
      let file = p;
      const st = fs.statSync(p);
      if (st.isDirectory()) {
        const unity = fs.readdirSync(p).find((f) => f.endsWith('.unity'));
        if (!unity) {
          return defaultObj;
        }
        file = path.join(p, unity);
      }
      const text = fs.readFileSync(file, 'utf-8');
      const posRe =
        /m_LocalPosition:\s*\{\s*x:\s*([^,}\s]+)\s*,\s*y:\s*([^,}\s]+)\s*,\s*z:\s*([^}]+)\}/g;
      const objs: HoloObjectDecl[] = [];
      let m: RegExpExecArray | null;
      let count = 0;
      while ((m = posRe.exec(text)) !== null) {
        const x = parseFloat(m[1]);
        const y = parseFloat(m[2]);
        const z = parseFloat(m[3]);
        objs.push(holoFactory.node(`transform_${count++}`, [], {
           properties: [{ type: 'ObjectProperty', key: 'position', value: [x, y, z] }]
        }));
      }
      if (objs.length === 0) {
        return defaultObj;
      }
      return objs;
    } catch (e) {
      return defaultObj;
    }
  }

  /**
   * Unreal `.uasset` / `.umap` are often binary; detect binary and hint re-export.
   * Text-like exports containing Engine script markers get a minimal placeholder.
   */
  private static parseUnrealUAsset(p: string): HoloObjectDecl[] {
    const defaultObj = holoFactory.node('unreal_placeholder', [], {
      properties: [{ type: 'ObjectProperty', key: 'position', value: [0, 0, 0] }]
    });
    try {
      const buf = fs.readFileSync(p);
      const nul = buf.indexOf(0);
      if (nul !== -1 && nul < 64) {
        return [holoFactory.node('binary_unreal_asset', [], {
           properties: [{ type: 'ObjectProperty', key: 'mesh', value: 'assets/unreal_import_placeholder.glb' }]
        }), defaultObj];
      }
      const head = buf.slice(0, 4096).toString('utf-8');
      if (head.includes('/Script/Engine') || head.includes('Begin Map')) {
        return [holoFactory.node('text_unreal_asset', [], {
           properties: [{ type: 'ObjectProperty', key: 'mesh', value: 'assets/unreal_mesh.glb' }]
        }), defaultObj];
      }
      return [defaultObj];
    } catch (e) {
      return [defaultObj];
    }
  }

  /** Parse URDF XML: emit `<link>` / `<joint>` summaries plus robotic trait reference. */
  private static parseROS2URDF(p: string): HoloObjectDecl[] {
    const defaultObj = holoFactory.node('urdf_robot', [holoFactory.trait('robotic_joint')]);
    try {
      const xml = fs.readFileSync(p, 'utf-8');
      const links = [...xml.matchAll(/<link[^>]*\bname="([^"]+)"/g)].map((x) => x[1]);
      const joints = [...xml.matchAll(/<joint[^>]*\bname="([^"]+)"[^>]*\btype="([^"]+)"/g)].map(
        (x) => ({ name: x[1], type: x[2] })
      );
      
      const objs: HoloObjectDecl[] = [];
      for (const name of links) {
        objs.push(holoFactory.node('link_' + LegacyImporter.escapeXmlAttr(name)));
      }
      for (const j of joints) {
        objs.push(holoFactory.node('joint_' + LegacyImporter.escapeXmlAttr(j.name), [], {
          properties: [{ type: 'ObjectProperty', key: 'type', value: LegacyImporter.escapeXmlAttr(j.type) }]
        }));
      }
      
      if (objs.length === 0) {
        return [defaultObj];
      }
      objs.push(defaultObj);
      return objs;
    } catch (e) {
      return [defaultObj];
    }
  }

  private static escapeXmlAttr(s: string): string {
    return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
  }
}
