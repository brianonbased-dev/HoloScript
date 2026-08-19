/* global console */

// Shared esbuild plugin: load `*.wgsl?raw` imports as text.
//
// WHY. The character-appearance harnesses (H3M..H3V) bundle HoloScript's
// CharacterWebGPUCompiler / rendering entry points with esbuild. HoloScript's
// packages/engine/src/character-render/character-render.ts:21 imports its skin
// shader with the Vite raw-import convention:
//
//   import skinSkinningWGSL from '../rendering/webgpu/shaders/skin-skinning.wgsl?raw';
//
// esbuild has no built-in loader for `.wgsl` and does not understand the `?raw`
// query suffix, so every harness that transitively reaches that module died with
//
//   ERROR: No loader is configured for ".wgsl" files: .../skin-skinning.wgsl?raw
//
// before running a single assertion. Ten gates could not produce a verdict at
// all - not "the property failed", but "the harness cannot build the code it
// claims to witness". Measured 2026-08-16: H3M, H3N, H3O, H3P, H3Q, H3R, H3S,
// H3T, H3U, H3V.
//
// WHAT THIS DOES NOT DO. Teaching the harness to bundle says nothing about
// whether any gate's property still holds. A gate unblocked by this plugin is
// expected to go on and report an honest verdict - very possibly a red one, on
// upstream hash drift. That is the point: this restores the gate's ability to
// answer, it does not answer for it.
//
// FAILS LOUD. A shader that cannot be read raises rather than resolving to
// empty text. An empty shader would bundle cleanly and silently change what the
// witness measured, which is the same failure shape as a missing tool whose
// absence reads as empty output.

import { readFileSync } from 'node:fs';
import path from 'node:path';

const WGSL_RAW = /\.wgsl(\?raw)?$/;

/**
 * @param {{ name?: string }} [options] distinct plugin name per harness, so two
 *   plugins in one build are still individually identifiable in esbuild logs.
 */
export function wgslRawPlugin({ name = 'model-village-wgsl-raw' } = {}) {
  const namespace = `${name}-ns`;
  return {
    name,
    setup(build) {
      build.onResolve({ filter: WGSL_RAW }, (args) => {
        const bare = args.path.replace(/\?raw$/, '');
        const resolved = path.isAbsolute(bare)
          ? bare
          : path.resolve(args.resolveDir || path.dirname(args.importer || ''), bare);
        return { path: resolved, namespace };
      });
      build.onLoad({ filter: /.*/, namespace }, (args) => {
        let contents;
        try {
          contents = readFileSync(args.path, 'utf8');
        } catch (error) {
          // Deliberately not `contents: ''`. An empty shader bundles fine and
          // silently changes what the gate measured.
          throw new Error(
            `wgsl raw import could not be read: ${args.path} (${error.code ?? error.message}). `
            + 'Refusing to substitute empty shader text - the witness would still be green '
            + 'while measuring something else.',
          );
        }
        if (contents.trim().length === 0) {
          throw new Error(
            `wgsl raw import is empty: ${args.path}. A witness bundled against an empty `
            + 'shader is not evidence about the shader.',
          );
        }
        return { contents, loader: 'text' };
      });
    },
  };
}

/**
 * Wrap an esbuild module so every `build()` it performs can resolve
 * `*.wgsl?raw` imports.
 *
 * Applied at the single seam the H3M..H3V harnesses share - H3O..H3V and H3N all
 * obtain their esbuild through `parseH3MStack`, so one wrapper covers ten gates
 * and any future gate built on the same stack. Attaching the plugin here rather
 * than at each `esbuild.build` call site also means a build added later cannot
 * silently miss it.
 *
 * The plugin is inert for builds that never import a `.wgsl` file: `onResolve`
 * fires only on that filter.
 */
export function withWgslRaw(esbuildModule) {
  return {
    ...esbuildModule,
    build(options = {}) {
      return esbuildModule.build({
        ...options,
        plugins: [...(options.plugins ?? []), wgslRawPlugin()],
      });
    },
  };
}

export default wgslRawPlugin;
