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
 */
import { createRequire } from "node:module";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import {
  analyze as analyzeWith,
  parseStrict as strictWith,
  parseTolerant as tolerantWith,
} from "./holo_strict.mjs";

const require = createRequire(import.meta.url);

/** Find the core: this package when the layer lives inside it, else the installed one. */
function findCoreRoot() {
  // strict/ sits inside packages/core, so ../dist is the parser we were built against.
  const inRepo = join(dirname(fileURLToPath(import.meta.url)), "..");
  if (existsSync(join(inRepo, "dist"))) return inRepo;
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

function loadCore() {
  const coreRoot = findCoreRoot();
  const distDir = join(coreRoot, "dist");
  const entry = readdirSync(distDir).find(
    (name) => name.startsWith("HoloCompositionParser-") && name.endsWith(".js")
  );
  if (!entry) {
    throw new Error(
      "@holoscript/strict: could not find HoloCompositionParser-*.js in @holoscript/core/dist"
    );
  }
  let traitIds = new Set();
  try {
    const registry = JSON.parse(
      readFileSync(join(coreRoot, "src", "traits", "trait-registry.json"), "utf8")
    );
    traitIds = new Set(Object.keys(registry));
  } catch {
    // No registry shipped: unknown-trait checking is skipped, everything else stands.
  }
  return { entryUrl: pathToFileURL(join(distDir, entry)).href, traitIds };
}

let depsPromise;
async function deps() {
  if (!depsPromise) {
    depsPromise = (async () => {
      const { entryUrl, traitIds } = loadCore();
      const mod = await import(entryUrl);
      return {
        tokenizeHoloSource: mod.tokenizeHoloSource,
        parseHolo: mod.parseHolo,
        traitIds,
      };
    })();
  }
  return depsPromise;
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

export async function analyze(source) {
  return analyzeWith(source, await deps());
}

export async function parseStrict(source) {
  return strictWith(source, await deps());
}

export async function parseTolerant(source) {
  return tolerantWith(source, await deps());
}
