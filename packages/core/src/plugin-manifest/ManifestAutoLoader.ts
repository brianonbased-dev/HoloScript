/**
 * ManifestAutoLoader — scan a plugins directory and auto-register every
 * plugin whose `plugin.manifest.json` declares `autoRegister: true`.
 *
 * Resolution order for the register function inside `runtimeEntry`:
 *   1. `module.registerTraitHandlers` — canonical name (preferred).
 *   2. First export matching `/^register\w+TraitHandlers$/` — backward-
 *      compat with older plugins that use a domain-specific name (e.g.
 *      `registerRoboticsTraitHandlers`).
 *
 * This is intentionally a runtime utility (Node.js `fs` + dynamic `import`)
 * and must NOT be bundled into browser builds. Tree-shake it out or use a
 * server-side entry that imports from `@holoscript/core/plugin-manifest/auto-loader`.
 */

import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import type { PluginManifest } from './PluginManifest';
import type { TraitRegistrarTarget } from '../runtime/plugin-trait-registrar';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface AutoLoadResult {
  /** Plugin ids successfully registered. */
  loaded: string[];
  /** Plugin ids with `autoRegister: false` — intentionally skipped. */
  skipped: string[];
  /** Plugins that encountered an error during load or registration. */
  failed: Array<{ id: string; error: string }>;
}

// ── Implementation ────────────────────────────────────────────────────────────

/**
 * Scan `pluginsDir` for subdirectories containing `plugin.manifest.json` and
 * auto-register all plugins whose manifest has `autoRegister: true`.
 *
 * @param pluginsDir  Absolute path to the plugins root (e.g. `packages/plugins`).
 * @param registrar   Runtime registrar to call each plugin's register function with.
 * @returns           Summary of what was loaded, skipped, and failed.
 */
export async function autoLoadPluginsFromManifests(
  pluginsDir: string,
  registrar: TraitRegistrarTarget,
): Promise<AutoLoadResult> {
  const loaded: string[] = [];
  const skipped: string[] = [];
  const failed: Array<{ id: string; error: string }> = [];

  let dirs: string[];
  try {
    dirs = readdirSync(pluginsDir, { withFileTypes: true })
      .filter((d) => d.isDirectory())
      .map((d) => d.name);
  } catch (e) {
    return { loaded, skipped, failed: [{ id: '<root>', error: (e as Error).message }] };
  }

  for (const dir of dirs) {
    const manifestPath = join(pluginsDir, dir, 'plugin.manifest.json');
    if (!existsSync(manifestPath)) continue;

    let manifest: PluginManifest;
    try {
      manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as PluginManifest;
    } catch (e) {
      failed.push({ id: dir, error: `manifest parse: ${(e as Error).message}` });
      continue;
    }

    if (!manifest.autoRegister) {
      skipped.push(manifest.id);
      continue;
    }

    const entry = manifest.runtimeEntry ?? './src/runtime.ts';
    const entryAbs = resolve(join(pluginsDir, dir), entry);

    if (!existsSync(entryAbs)) {
      failed.push({ id: manifest.id, error: `runtimeEntry not found: ${entryAbs}` });
      continue;
    }

    try {
      const mod = (await import(pathToFileURL(entryAbs).href)) as Record<string, unknown>;

      // Prefer canonical name, fall back to first domain-specific name
      let fn = mod['registerTraitHandlers'];
      if (typeof fn !== 'function') {
        const found = Object.entries(mod).find(
          ([k, v]) => typeof v === 'function' && /^register\w+TraitHandlers$/.test(k),
        );
        fn = found?.[1];
      }

      if (typeof fn !== 'function') {
        failed.push({
          id: manifest.id,
          error: `no registerTraitHandlers export in ${entry}`,
        });
        continue;
      }

      (fn as (r: TraitRegistrarTarget) => void)(registrar);
      loaded.push(manifest.id);
    } catch (e) {
      failed.push({ id: manifest.id, error: (e as Error).message });
    }
  }

  return { loaded, skipped, failed };
}
