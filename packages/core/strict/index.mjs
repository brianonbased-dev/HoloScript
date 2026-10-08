/**
 * @holoscript/strict — the rejection layer for HoloScript.
 *
 * Wraps the parser in @holoscript/core so invalid source is refused with a
 * code, a line and a column instead of parsing as an empty composition.
 * Nothing in core changes; this package only adds the "no".
 *
 *   import { parseStrict, parseTolerant, CODES } from '@holoscript/strict';
 *
 *   parseStrict('{{{@@@')   // { ok: false, diagnostics: [HS1002, HS1005, ...] }
 *   parseStrict('object Cube { position: [0, 1, 0] }')   // { ok: true, ast }
 *   parseTolerant(src)      // always ok, keeps the AST, reports the same diagnostics
 *
 * Everything it takes from core comes through core's public `exports` map:
 *   "./parser"                       tokenizeHoloSource, parseHolo
 *   "./constants"                    VR_TRAITS
 *   "./traits/trait-registry.json"   the generated trait registry
 *   "."                              buildKnownTraitSet, DERIVED_TRAIT_SCHEMAS
 *                                    (loaded only when the lists above miss a name)
 * The trait vocabulary is the union of all four. If none can be loaded, the
 * unknown-trait check (HS1006) is skipped and every other check still runs;
 * `coreInfo()` reports which sources were loaded.
 */
import { createRequire } from "node:module";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import {
  analyze as analyzeWith,
  parseStrict as strictWith,
  parseTolerant as tolerantWith,
} from "./holo_strict.mjs";

const require = createRequire(import.meta.url);

/** True when `manifest` is @holoscript/core's package.json, not just any package with a dist/. */
function isCorePackage(manifest) {
  try {
    return JSON.parse(readFileSync(manifest, "utf8")).name === "@holoscript/core";
  } catch {
    return false;
  }
}

/** Find the core: this package when the layer lives inside it, else the installed one. */
function findCoreRoot() {
  // strict/ sits inside packages/core, so ../dist is the parser we were built against.
  const inRepo = join(dirname(fileURLToPath(import.meta.url)), "..");
  if (existsSync(join(inRepo, "dist")) && isCorePackage(join(inRepo, "package.json"))) return inRepo;
  try {
    return dirname(require.resolve("@holoscript/core/package.json"));
  } catch {
    // Exports map hides package.json: resolve the entry point and walk up.
  }
  let dir = dirname(require.resolve("@holoscript/core"));
  while (dir !== dirname(dir)) {
    const manifest = join(dir, "package.json");
    if (existsSync(manifest)) {
      try {
        if (JSON.parse(readFileSync(manifest, "utf8")).name === "@holoscript/core") return dir;
      } catch {
        // keep walking
      }
    }
    dir = dirname(dir);
  }
  throw new Error("@holoscript/strict: @holoscript/core is not installed");
}

/** The file core's `exports` map publishes for `subpath` (ESM condition). */
function publicFile(coreRoot, manifest, subpath) {
  const entry = manifest.exports && manifest.exports[subpath];
  const target = typeof entry === "string" ? entry : entry && (entry.import || entry.default);
  if (!target) {
    throw new Error(`@holoscript/strict: @holoscript/core does not export "${subpath}"`);
  }
  return join(coreRoot, target);
}

async function loadCore() {
  const coreRoot = findCoreRoot();
  const manifest = JSON.parse(readFileSync(join(coreRoot, "package.json"), "utf8"));

  const parserFile = publicFile(coreRoot, manifest, "./parser");
  const parser = await import(pathToFileURL(parserFile).href);
  if (typeof parser.tokenizeHoloSource !== "function" || typeof parser.parseHolo !== "function") {
    throw new Error(
      "@holoscript/strict: @holoscript/core/parser does not export tokenizeHoloSource and parseHolo"
    );
  }

  const traitIds = new Set();
  const traitSources = [];
  try {
    const constants = await import(pathToFileURL(publicFile(coreRoot, manifest, "./constants")).href);
    if (Array.isArray(constants.VR_TRAITS) && constants.VR_TRAITS.length) {
      for (const id of constants.VR_TRAITS) traitIds.add(String(id));
      traitSources.push("@holoscript/core/constants#VR_TRAITS");
    }
  } catch {
    // Not available in this core: the registry below may still be.
  }
  try {
    const registryFile = publicFile(coreRoot, manifest, "./traits/trait-registry.json");
    const registry = JSON.parse(readFileSync(registryFile, "utf8"));
    const ids = Object.keys(registry);
    if (ids.length) {
      for (const id of ids) traitIds.add(id);
      traitSources.push("@holoscript/core/traits/trait-registry.json");
    }
  } catch {
    // No registry shipped: VR_TRAITS above may still be.
  }

  return {
    coreRoot,
    manifest,
    deps: { tokenizeHoloSource: parser.tokenizeHoloSource, parseHolo: parser.parseHolo, traitIds },
    info: {
      coreRoot,
      coreVersion: manifest.version,
      parser: parserFile,
      traitSources,
      traitCheck: traitIds.size > 0,
    },
    full: null,
  };
}

/**
 * The rest of core's trait vocabulary lives only on its main entry, which is
 * far heavier to load than the parser, so it is loaded once, the first time a
 * source uses a trait the two lists above do not know:
 *   buildKnownTraitSet()   the parser/LSP/linter vocabulary (VR_TRAITS plus the
 *                          Native2D panel, code-graph and runtime-directive names)
 *   DERIVED_TRAIT_SCHEMAS  every trait declared by a `.holo` `@trait { ... }` file
 *                          under packages/core/src/traits
 */
function loadFullVocabulary(state) {
  if (!state.full) {
    state.full = (async () => {
      try {
        const main = await import(pathToFileURL(publicFile(state.coreRoot, state.manifest, ".")).href);
        const traitIds = new Set(state.deps.traitIds);
        const before = traitIds.size;
        if (typeof main.buildKnownTraitSet === "function") {
          for (const id of main.buildKnownTraitSet()) traitIds.add(String(id));
          state.info.traitSources.push("@holoscript/core#buildKnownTraitSet");
        }
        if (Array.isArray(main.DERIVED_TRAIT_SCHEMAS)) {
          for (const schema of main.DERIVED_TRAIT_SCHEMAS) {
            if (schema && schema.name) traitIds.add(String(schema.name));
          }
          state.info.traitSources.push("@holoscript/core#DERIVED_TRAIT_SCHEMAS");
        }
        if (traitIds.size > before || before === 0) {
          state.deps = { ...state.deps, traitIds };
          state.info.traitCheck = traitIds.size > 0;
        }
      } catch {
        // Main entry unavailable: keep the vocabulary already loaded.
      }
    })();
  }
  return state.full;
}

let corePromise;
function core() {
  if (!corePromise) corePromise = loadCore();
  return corePromise;
}

/** Deps with a vocabulary complete enough for `source`. */
async function depsFor(source, options) {
  const state = await core();
  if (!state.full && typeof source === "string") {
    const probe = analyzeWith(source, state.deps, options);
    if (probe.diagnostics.some((d) => d.code === "HS1006")) await loadFullVocabulary(state);
  }
  return state.deps;
}

/**
 * Which core this layer is running against and where its trait vocabulary
 * came from. `traitCheck: false` means HS1006 is not being checked. Pass
 * `{ fullVocabulary: true }` to load the main-entry vocabulary first.
 */
export async function coreInfo(options = {}) {
  const state = await core();
  if (options.fullVocabulary) await loadFullVocabulary(state);
  return { ...state.info, traitSources: [...state.info.traitSources] };
}

export const CODES = {
  HS1001: "empty source",
  HS1002: "unbalanced delimiter",
  HS1003: "token cannot start a top-level item",
  HS1004: "nothing parsed into the composition",
  HS1005: "trait with no name",
  HS1006: "unknown trait",
  HS1007: "parser error",
  HS1008: "parser warning",
  HS1009: "source is not a string",
  HS1010: "tokenizer or parser threw",
};

/**
 * Options for every entry point:
 *   knownTraits    extra trait names for this call (for example a plugin's), the
 *                  same seam as core's `HoloParserOptions.knownTraits`
 *   unknownTraits  "warning" (default) or "error": the severity of HS1006
 */
export async function analyze(source, options = {}) {
  return analyzeWith(source, await depsFor(source, options), options);
}

export async function parseStrict(source, options = {}) {
  return strictWith(source, await depsFor(source, options), options);
}

export async function parseTolerant(source, options = {}) {
  return tolerantWith(source, await depsFor(source, options), options);
}
