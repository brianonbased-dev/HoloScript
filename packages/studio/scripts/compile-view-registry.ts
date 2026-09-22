#!/usr/bin/env tsx
/**
 * HoloScript Studio — View Registry Compiler (native-surface dogfood)
 *
 * Derives the Studio view registry from per-panel `.holo` composition files in
 * src/lib/studio/panels/ instead of hand-maintaining parallel `Record<>` maps.
 * Each panel is a `.holo` that declares its view metadata via an `@view({...})`
 * decorator and mounts its React widget via `@slot(...)` — parsed with
 * @holoscript/core parseHolo (F.014: no regex). The registry is a GENERATED
 * artifact (viewRegistry.generated.ts); viewRegistry.ts re-exports it.
 *
 * `order` in @view preserves the curated registry/command-palette order
 * (vs alphabetical), so the flip to generated-as-source changes no UI behavior.
 *
 * Usage: pnpm viewreg:build   |   pnpm viewreg:check  (--strict --check)
 *
 * NOT a CI gate, whatever this line used to say. Measured 2026-09-21: nothing in
 * this repo runs viewreg:check, holo:check or vector:check. .github/workflows/
 * holds only _archived/, and no local runner enumerates the check: scripts. Run
 * `pnpm check:studio-generators` by hand -- it runs all three -- and run it
 * BEFORE a build, not after: these compare the generator against the file on
 * disk, which is the committed copy only while the tree is clean.
 */
import { readFileSync, writeFileSync, existsSync, readdirSync, mkdirSync } from 'fs';
import { join, extname, basename, dirname } from 'path';
import { format, resolveConfig } from 'prettier';
import { parseHolo } from '../../core/src/parser/HoloCompositionParser';
import { Native2DCompiler } from '../../core/src/compiler/Native2DCompiler';

const STUDIO_ROOT = join(import.meta.dirname || __dirname, '..');
const PANELS_DIR = join(STUDIO_ROOT, 'src', 'lib', 'studio', 'panels');
const NATIVE_FRAGMENTS_DIR = join(STUDIO_ROOT, 'src', 'lib', 'studio', 'fragments');
const NATIVE_OUT_DIR = join(STUDIO_ROOT, 'src', 'components', 'panels', 'native');
const OUT_PATH = join(STUDIO_ROOT, 'src', 'lib', 'studio', 'viewRegistry.generated.ts');
const COMPONENTS_OUT_PATH = join(
  STUDIO_ROOT,
  'src',
  'lib',
  'studio',
  'viewRegistry.components.tsx'
);
const STRICT = process.argv.includes('--strict') || process.env.HOLO_STRICT === '1';
/**
 * --check: regenerate into memory and COMPARE, never write.
 *
 * Measured 2026-09-21 on a clean checkout of main: this generator, run with NO
 * source change, rewrote 12 files (2,164 insertions, 3,092 deletions) and produced
 * byte-identical output on three consecutive runs. So the generator is idempotent
 * and the COMMITTED artifacts were the drift: stale against their own .holo sources
 * for a month (registry regenerated 2026-08-17, panel sources changed 2026-08-20),
 * and reformatted in place by 8b0f3a850, a 'purely cosmetic prettier' pass over
 * files whose first line reads '@generated ... DO NOT EDIT'.
 *
 * While that is true, no change to a generated surface can be reviewed: every real
 * diff drowns in thousands of lines of restoration.
 *
 * --strict is a DIFFERENT question, and viewreg:check now runs both. --strict fails
 * when a .holo file will not compile. A tree can be perfectly compilable and still
 * ship stale committed output -- which is exactly what happened: viewreg:check
 * passed all month while the artifacts it guards drifted from their sources.
 */
const CHECK = process.argv.includes('--check');
const drift: string[] = [];
const orphans: string[] = [];

const PENDING: Array<{ target: string; content: string }> = [];
/** Every path this run emitted, kept after PENDING drains, so orphans can be found. */
const EMITTED = new Set<string>();

/** Buffer one generated artifact. finish() decides whether it is written or compared. */
function emit(target: string, content: string): void {
  EMITTED.add(target);
  PENDING.push({ target, content });
}

/**
 * Format every buffered artifact, then write it (build) or compare it against the
 * committed copy (--check). Both modes consume the identical bytes, so the check
 * cannot drift away from the build it guards.
 *
 * The generator formats its own output rather than leaving the committed copies in
 * .prettierignore, because the sibling generators (compile-holo-pages,
 * compile-vector-pages) settled the same question the same way on the same day, and
 * a repo where some generated surfaces are formatted and others are exempt is a
 * repo where nobody can tell which rule applies to the file in front of them.
 *
 * Prettier is applied through the API, not the CLI: .prettierignore carries
 * `**\/*.generated.ts`, yet the committed viewRegistry.generated.ts IS formatted, so
 * only the API path reproduces it.
 */
async function finish(): Promise<void> {
  for (const { target, content } of PENDING.splice(0, PENDING.length)) {
    const config = await resolveConfig(target);
    let pretty = content;
    try {
      pretty = await format(content, { ...config, filepath: target });
    } catch {
      // A generated file prettier cannot parse is a compiler bug, not a formatting
      // one. Keep the raw bytes so the real error surfaces where it belongs.
      pretty = content;
    }

    if (CHECK) {
      let current: string | null = null;
      try {
        current = readFileSync(target, 'utf-8');
      } catch {
        current = null;
      }
      if (current !== pretty) drift.push(target);
      continue;
    }

    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, pretty, 'utf-8');
  }
}

interface ViewMeta {
  id: string;
  title: string;
  icon: string;
  category: string;
  placement: string;
  scope: string;
  gate: string;
  surfaceClass: string;
  defaultOpen: boolean;
  exclusiveWith: string[];
  order: number;
}
interface SlotMeta {
  component: string;
  import: string;
}

function extractView(ast: any, file: string): ViewMeta {
  const viewTrait = (ast.traits ?? []).find((t: any) => t.name === 'view');
  if (!viewTrait?.config?._arg0) {
    throw new Error(`${file}: missing @view({...}) decorator on composition`);
  }
  const v = viewTrait.config._arg0 as Partial<ViewMeta>;
  const required = [
    'id',
    'title',
    'icon',
    'category',
    'placement',
    'scope',
    'gate',
    'surfaceClass',
  ];
  for (const k of required) {
    if (v[k as keyof ViewMeta] === undefined) throw new Error(`${file}: @view missing '${k}'`);
  }
  return {
    id: v.id!,
    title: v.title!,
    icon: v.icon!,
    category: v.category!,
    placement: v.placement!,
    scope: v.scope!,
    gate: v.gate!,
    surfaceClass: v.surfaceClass!,
    defaultOpen: v.defaultOpen ?? false,
    exclusiveWith: v.exclusiveWith ?? [],
    order: typeof v.order === 'number' ? v.order : 9999,
  };
}

function extractSlot(ast: any): SlotMeta | null {
  const obj = (ast.objects ?? [])[0];
  const slot = obj?.traits?.find((t: any) => t.name === 'slot');
  if (!slot?.config?.component || !slot?.config?.import) return null;
  return { component: slot.config.component, import: slot.config.import };
}

/** True when the panel has @native_panel trait — content compiled, not hand-wired React. */
function hasNativeContent(ast: any): boolean {
  return (ast.traits ?? []).some((t: any) => t.name === 'native_panel');
}

/** Compile a native panel composition to a @generated React component. Returns the component name. */
function compileNativePanel(ast: any, id: string): string {
  const capitalized = id.charAt(0).toUpperCase() + id.slice(1);
  const compiler = new Native2DCompiler();
  const code = compiler.generateReactComponent(capitalized, ast.objects ?? [], ast, {
    format: 'react',
  });
  mkdirSync(NATIVE_OUT_DIR, { recursive: true });
  emit(join(NATIVE_OUT_DIR, `${id}.native.tsx`), code);
  return `${capitalized}Component`;
}

/** Compile HoloScript-owned fragments that mount inside an existing Studio panel. */
function compileNativeFragment(ast: any, id: string): string {
  const componentName =
    typeof ast.name === 'string' && ast.name.trim()
      ? ast.name.replace(/[^a-zA-Z0-9]/g, '')
      : id.charAt(0).toUpperCase() + id.slice(1);
  if (!componentName) throw new Error(`${id}.holo: composition name is invalid`);
  const hasFragmentTrait = (ast.traits ?? []).some((t: any) => t.name === 'native_fragment');
  if (!hasFragmentTrait) throw new Error(`${id}.holo: missing @native_fragment trait`);
  const compiler = new Native2DCompiler();
  const code = compiler.generateReactComponent(componentName, ast.objects ?? [], ast, {
    format: 'react',
  });
  mkdirSync(NATIVE_OUT_DIR, { recursive: true });
  emit(join(NATIVE_OUT_DIR, `${id}.native.tsx`), code);
  return `${componentName}Component`;
}

/** Map the .holo @view source fields onto the StudioViewDefinition shape (order stripped). */
function toDefinition(v: ViewMeta) {
  return {
    id: v.id,
    title: v.title,
    icon: v.icon,
    category: v.category,
    defaultPlacement: v.placement,
    activationCommand: `studio.view.${v.id}.toggle`,
    workspaceScope: v.scope,
    availabilityGate: v.gate,
    surfaceClass: v.surfaceClass,
    defaultOpen: v.defaultOpen,
    exclusiveWith: v.exclusiveWith,
  };
}

async function build(): Promise<void> {
  if (!existsSync(PANELS_DIR)) {
    console.log(`No panels dir at ${PANELS_DIR}; nothing to compile.`);
    return;
  }
  const files = readdirSync(PANELS_DIR)
    .filter((f) => extname(f) === '.holo')
    .sort();

  const views: ViewMeta[] = [];
  const slots: Record<string, SlotMeta> = {};
  let errorCount = 0;

  for (const f of files) {
    const full = join(PANELS_DIR, f);
    try {
      const parsed = parseHolo(readFileSync(full, 'utf-8'));
      if (!parsed.success || !parsed.ast) {
        throw new Error(`${f}: parse failed — ${JSON.stringify(parsed.errors?.[0] ?? 'unknown')}`);
      }
      const view = extractView(parsed.ast, f);
      if (view.id !== basename(f, '.holo')) {
        throw new Error(`${f}: @view id '${view.id}' must match filename`);
      }
      views.push(view);
      const slot = extractSlot(parsed.ast);
      if (slot) {
        slots[view.id] = slot;
        console.log(`  ✓ ${f} → ${view.id} (${view.surfaceClass}, order ${view.order})`);
      } else if (hasNativeContent(parsed.ast)) {
        const componentName = compileNativePanel(parsed.ast, view.id);
        slots[view.id] = {
          component: componentName,
          import: `@/components/panels/native/${view.id}.native`,
        };
        console.log(`  ✓ ${f} → ${view.id} (native compiled → ${componentName})`);
      } else {
        console.log(`  ✓ ${f} → ${view.id} (pending, order ${view.order})`);
      }
    } catch (err) {
      errorCount++;
      console.error(`  ✗ ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  if (existsSync(NATIVE_FRAGMENTS_DIR)) {
    const fragments = readdirSync(NATIVE_FRAGMENTS_DIR)
      .filter((f) => extname(f) === '.holo')
      .sort();
    for (const f of fragments) {
      const full = join(NATIVE_FRAGMENTS_DIR, f);
      try {
        const parsed = parseHolo(readFileSync(full, 'utf-8'));
        if (!parsed.success || !parsed.ast) {
          throw new Error(
            `${f}: parse failed -- ${JSON.stringify(parsed.errors?.[0] ?? 'unknown')}`
          );
        }
        const id = basename(f, '.holo');
        const componentName = compileNativeFragment(parsed.ast, id);
        console.log(`  [ok] fragments/${f} (native compiled -> ${componentName})`);
      } catch (err) {
        errorCount++;
        console.error(`  [error] ${err instanceof Error ? err.message : String(err)}`);
      }
    }
  }

  // Preserve curated order (the hand-TS VIEW_TITLES insertion order, captured as
  // @view order); tie-break by id for determinism.
  views.sort((a, b) => a.order - b.order || a.id.localeCompare(b.id));
  const defs = views.map(toDefinition);
  const ids = views.map((v) => v.id);

  const out =
    '// @generated by scripts/compile-view-registry.ts from src/lib/studio/panels/*.holo — DO NOT EDIT\n' +
    "'use client';\n\n" +
    "import type { StudioViewDefinition } from './viewRegistry';\n\n" +
    '/** Canonical view ids in curated order — the StudioViewId literal-union source. */\n' +
    `export const GENERATED_VIEW_IDS = ${JSON.stringify(ids)} as const;\n\n` +
    '/** View definitions derived from panel .holo compositions (dogfood), in curated order. */\n' +
    `export const GENERATED_VIEW_REGISTRY: StudioViewDefinition[] = ${JSON.stringify(defs, null, 2)};\n\n` +
    '/** Per-view React widget mounts declared via @slot in each panel .holo. */\n' +
    `export const GENERATED_VIEW_SLOTS: Record<string, { component: string; import: string }> = ${JSON.stringify(
      slots,
      null,
      2
    )};\n`;

  emit(OUT_PATH, out);

  // Companion: literal dynamic-import map for slotted views. Webpack cannot
  // import(variableString), so the literal paths must be emitted at build time.
  // `pick` resolves named-or-default export. A registry-driven panel host mounts
  // VIEW_COMPONENTS[viewId]; until wired, tsc validates every @slot import path
  // here (a wrong path fails the typecheck — the mounts are real, not fiction).
  const slotEntries = Object.entries(slots).sort(([a], [b]) => a.localeCompare(b));
  const componentsOut =
    '// @generated by scripts/compile-view-registry.ts from panel .holo @slot — DO NOT EDIT\n' +
    "'use client';\n\n" +
    "import dynamic from 'next/dynamic';\n" +
    "import type { ComponentType } from 'react';\n\n" +
    'type AnyModule = Record<string, unknown>;\n' +
    'const pick = (m: AnyModule, name: string): ComponentType<unknown> =>\n' +
    '  ((m[name] ?? (m as { default?: unknown }).default) as ComponentType<unknown>);\n\n' +
    '/** Dynamically-imported React widget for each slotted view (by view id). */\n' +
    'export const VIEW_COMPONENTS: Record<string, ComponentType<unknown>> = {\n' +
    slotEntries
      .map(
        ([id, s]) =>
          `  ${JSON.stringify(id)}: dynamic(() => import(${JSON.stringify(
            s.import
          )}).then((m) => ({ default: pick(m as AnyModule, ${JSON.stringify(s.component)}) }))),`
      )
      .join('\n') +
    '\n};\n';
  emit(COMPONENTS_OUT_PATH, componentsOut);

  // A FAILING PANEL MUST NOT SILENTLY LEAVE THE REGISTRY.
  //
  // finish() writes both artifacts, and it used to run unconditionally -- before
  // the errorCount branch at the bottom that prints "keeping last-good generated
  // registry; deploy NOT blocked". That sentence was false for this generator.
  // The registry is a single AGGREGATE artifact: a panel that fails to compile
  // is simply absent from `views`, so the reduced registry was written and the
  // view disappeared. Measured: breaking one panel took the registry from 91
  // views to 90, exit 0, no red anywhere -- and `prebuild` runs viewreg:build,
  // so a one-character typo in a panel shipped a Studio with that panel missing.
  //
  // The borrowed rationale is sound for compile-holo-pages, where each page is
  // its own file and a failing page's file is simply left untouched. Here,
  // keeping the last-good registry means not writing at all.
  if (errorCount > 0 && !CHECK) {
    console.warn(
      `\n⚠ viewreg:build: ${errorCount} panel .holo file(s) did not compile — ` +
        `NOT writing the registry, so the last-good one on disk is kept.\n` +
        `  Fix the panel(s) above and re-run; the registry is an aggregate, so a\n` +
        `  partial write would silently drop the failing panel's view.`
    );
  } else {
    await finish();
  }

  if (CHECK) {
    // --strict is not suspended by --check. viewreg:check passes BOTH, and this
    // block used to return before reaching the strict throw below, so a panel
    // .holo that could not compile printed its own error and the check then said
    // OK and exited 0. Found in review at 504c9783f; reproduced with a new panel
    // that has no @view decorator and no committed output, so neither the drift
    // nor the orphan scan could mask it:
    //
    //   before:  ✗ zzBroken.holo: missing @view({...}) decorator
    //            viewreg:check OK -- 91 view(s) ...                    exit 0
    //   after:   viewreg:check FAILED -- 1 panel .holo file(s) did not compile
    //                                                                  exit 1
    //
    // A gate that prints the fault and then reports success is worse than one
    // that never looked, which is the whole subject of this change.
    if (errorCount > 0) {
      const msg = `${errorCount} panel .holo file(s) did not compile`;
      if (STRICT) {
        console.error('');
        console.error(`viewreg:check FAILED -- ${msg} (see the errors above).`);
        process.exitCode = 1;
      } else {
        console.warn(`\n⚠ viewreg:check: ${msg} — pass --strict to fail on this.`);
      }
    }

    // ORPHANS: a committed artifact whose SOURCE is gone.
    //
    // Comparing emitted output against the tree can only see files the generator
    // still produces. Delete a panel .holo and its .native.tsx keeps shipping:
    // the generator never emits it, so nothing ever compares it, and the check
    // reports OK. Probed 2026-09-21 by copying one .native.tsx under a new name
    // -- exit 0, "committed output matches the generator". A check that cannot
    // see a file it is supposed to own is the failure this whole PR is about,
    // so it is fixed here rather than disclosed.
    //
    // Scoped to the generator's own output directory, where every *.native.tsx
    // is its work (11 files and a __tests__ dir, verified). The registry and the
    // component map are single fixed paths and cannot be orphaned this way.
    try {
      for (const name of readdirSync(NATIVE_OUT_DIR)) {
        if (!name.endsWith('.native.tsx')) continue;
        const full = join(NATIVE_OUT_DIR, name);
        if (!EMITTED.has(full)) orphans.push(full);
      }
    } catch {
      // No output directory yet: nothing generated, so nothing orphaned.
    }

    // AN INCOMPLETE EMITTED SET CANNOT DIAGNOSE AN ORPHAN.
    //
    // EMITTED is filled inside the per-panel try block, so a panel whose source
    // merely FAILS TO PARSE never lands in it -- and its generated file then
    // looks orphaned. The message went on to assert "their panel .holo source is
    // gone" and to offer "delete them", which for a source typo means deleting a
    // live, still-imported component while the source sits right there. The
    // compile errors are already reported above; this scan has nothing to add
    // until they are fixed.
    if (errorCount > 0 && orphans.length > 0) {
      console.error('');
      console.error(
        `  (orphan scan skipped: ${errorCount} panel(s) failed to compile, so the emitted set is`
      );
      console.error('   incomplete and cannot tell a real orphan from a panel that did not build.)');
    } else if (orphans.length > 0) {
      console.error('');
      console.error(
        `viewreg:check FAILED -- ${orphans.length} generated file(s) this generator no longer emits:`
      );
      for (const f of orphans) console.error(`    ${f}`);
      console.error('');
      console.error('  Every panel compiled, so nothing emits these: their .holo source is gone.');
      console.error('  Restore the source if the view is wanted; delete the file if it is not.');
      console.error('  Check what still imports it before deleting.');
      process.exitCode = 1;
    }

    if (drift.length > 0) {
      console.error('');
      console.error(
        `viewreg:check FAILED -- ${drift.length} generated file(s) differ from what this generator emits:`
      );
      for (const f of drift) console.error(`    ${f}`);
      console.error('');
      console.error('  The committed output is stale or was hand-edited.');
      console.error('  Fix: pnpm run viewreg:build, then commit the result.');
      console.error('  Never edit a @generated file directly -- change the panel .holo source.');
      process.exitCode = 1;
    } else if (orphans.length === 0 && errorCount === 0) {
      console.log('');
      console.log(
        `viewreg:check OK -- ${defs.length} view(s), ${slotEntries.length} mount(s), ` +
          `${EMITTED.size} emitted file(s): committed output matches the generator, ` +
          `and nothing in the output directory is unaccounted for.`
      );
    }
    return;
  }

  // SAY WHAT HAPPENED. When a panel fails to compile the write is skipped above,
  // and this line went on announcing "Wrote 90 view(s) → <path>" about a file it
  // had not touched -- swapping one false message for another. The count is also
  // the REDUCED one, so it silently reported the drop it was meant to prevent.
  if (errorCount > 0) {
    console.log(
      `\nNOT written: ${defs.length} view(s) and ${slotEntries.length} mount(s) would have been ` +
        `emitted, but ${errorCount} panel(s) failed to compile, so the files on disk are unchanged.`
    );
  } else {
    console.log(
      `\nWrote ${defs.length} view(s) → ${OUT_PATH}\n` +
        `Wrote ${slotEntries.length} component mount(s) → ${COMPONENTS_OUT_PATH}`
    );
  }

  if (errorCount > 0) {
    const msg = `viewreg:build: ${errorCount} panel .holo file(s) did not compile`;
    if (STRICT) throw new Error(`${msg} (strict mode — failing the gate)`);
    // The write was already skipped above, so "last-good is kept" is now a fact
    // rather than a claim. And pre-push runs check:studio-generators on any push
    // touching packages/studio, so the old "nothing runs this for you" is stale.
    console.warn(
      `\n⚠ ${msg} — the registry was not rewritten; deploy NOT blocked.\n` +
        `  pre-push runs pnpm check:studio-generators for you, but fix the panel first.`
    );
  }
}

build().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
