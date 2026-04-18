import * as fs from 'fs';
import * as path from 'path';
import { parseHolo } from '@holoscript/core';

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

    // B6 (NORTH_STAR DT-14): validate the emitted .holo through the real
    // parser. The current legacy importer emits XML-shaped content inside
    // a .holo file, which parseHolo will reject — but that is a
    // pre-existing bug, not a regression introduced by this gate. The
    // gate surfaces it loudly instead of silently writing broken output
    // that breaks downstream consumers. When the XML→HoloScript converter
    // is actually implemented, the warning stops firing.
    const validation = LegacyImporter.validateHoloContent(holoContent);

    const finalPath = path.join(options.outputPath, 'imported_scene.holo');
    fs.mkdirSync(options.outputPath, { recursive: true });
    fs.writeFileSync(finalPath, holoContent, 'utf-8');

    if (!validation.valid) {
      console.warn(
        `[HoloMesh:Absorb] WARNING: legacy ${options.engineType} import produced ` +
          `invalid .holo output at ${finalPath}. First ${Math.min(
            3,
            validation.parseErrors.length
          )} parse error(s): ${validation.parseErrors.slice(0, 3).join(' | ')}. ` +
          `Downstream HoloScript consumers will fail to parse this file. ` +
          `Fix: implement a proper ${options.engineType} -> HoloScript AST converter.`
      );
    } else {
      console.log(
        `[HoloMesh:Absorb] Successfully compiled legacy ${options.engineType} data to ${finalPath}`
      );
    }
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
  private static parseUnityYaml(p: string): string {
    try {
      let file = p;
      const st = fs.statSync(p);
      if (st.isDirectory()) {
        const unity = fs.readdirSync(p).find((f) => f.endsWith('.unity'));
        if (!unity) {
          return '<!-- No .unity file in directory — pass a .unity path or add scenes to the folder -->\n';
        }
        file = path.join(p, unity);
      }
      const text = fs.readFileSync(file, 'utf-8');
      const posRe =
        /m_LocalPosition:\s*\{\s*x:\s*([^,}\s]+)\s*,\s*y:\s*([^,}\s]+)\s*,\s*z:\s*([^}]+)\}/g;
      const frags: string[] = [];
      let m: RegExpExecArray | null;
      while ((m = posRe.exec(text)) !== null) {
        const x = m[1].trim();
        const y = m[2].trim();
        const z = m[3].trim();
        frags.push(`<transform x="${x}" y="${y}" z="${z}"/>`);
      }
      if (frags.length === 0) {
        return '<!-- No m_LocalPosition blocks found — export a scene that includes Transform data -->\n<transform x="0" y="0" z="0"/>';
      }
      return frags.join('\n    ');
    } catch (e) {
      return `<!-- Unity YAML read failed: ${String(e)} -->\n<transform x="0" y="0" z="0"/>`;
    }
  }

  /**
   * Unreal `.uasset` / `.umap` are often binary; detect binary and hint re-export.
   * Text-like exports containing Engine script markers get a minimal placeholder.
   */
  private static parseUnrealUAsset(p: string): string {
    try {
      const buf = fs.readFileSync(p);
      const nul = buf.indexOf(0);
      if (nul !== -1 && nul < 64) {
        return `<!-- Binary Unreal asset — re-export via FBX/Datasmith or text dump for full import -->\n<mesh path="assets/unreal_import_placeholder.glb"/>\n<transform x="0" y="0" z="0"/>`;
      }
      const head = buf.slice(0, 4096).toString('utf-8');
      if (head.includes('/Script/Engine') || head.includes('Begin Map')) {
        return `<!-- Unreal text-like export — actor graph not fully parsed -->\n<mesh path="assets/unreal_mesh.glb"/>\n<transform x="0" y="0" z="0"/>`;
      }
      return '<!-- Unrecognized Unreal file — use ASCII export when possible -->\n<transform x="0" y="0" z="0"/>';
    } catch (e) {
      return `<!-- Unreal read failed: ${String(e)} -->\n<transform x="0" y="0" z="0"/>`;
    }
  }

  /** Parse URDF XML: emit `<link>` / `<joint>` summaries plus robotic trait reference. */
  private static parseROS2URDF(p: string): string {
    try {
      const xml = fs.readFileSync(p, 'utf-8');
      const links = [...xml.matchAll(/<link[^>]*\bname="([^"]+)"/g)].map((x) => x[1]);
      const joints = [...xml.matchAll(/<joint[^>]*\bname="([^"]+)"[^>]*\btype="([^"]+)"/g)].map(
        (x) => ({ name: x[1], type: x[2] })
      );
      const lines: string[] = [];
      for (const name of links) {
        lines.push(`<link name="${LegacyImporter.escapeXmlAttr(name)}" />`);
      }
      for (const j of joints) {
        lines.push(
          `<joint name="${LegacyImporter.escapeXmlAttr(j.name)}" type="${LegacyImporter.escapeXmlAttr(j.type)}" />`
        );
      }
      lines.push(`<trait name="@robotic_joint" />`);
      if (lines.length === 1) {
        return '<!-- No link/joint elements matched — ensure valid URDF -->\n<trait name="@robotic_joint" />';
      }
      return lines.join('\n    ');
    } catch (e) {
      return `<!-- URDF parse error: ${String(e)} -->\n<trait name="@robotic_joint" />`;
    }
  }

  private static escapeXmlAttr(s: string): string {
    return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
  }
}
