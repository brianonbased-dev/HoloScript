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
 * Usage: pnpm viewreg:build   |   pnpm viewreg:check  (--strict, CI gate)
 */
import { readFileSync, writeFileSync, existsSync, readdirSync, mkdirSync } from 'fs';
import { join, extname, basename } from 'path';
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
  writeFileSync(join(NATIVE_OUT_DIR, `${id}.native.tsx`), code, 'utf-8');
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
  writeFileSync(join(NATIVE_OUT_DIR, `${id}.native.tsx`), code, 'utf-8');
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

function build(): void {
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
            `${f}: parse failed â€” ${JSON.stringify(parsed.errors?.[0] ?? 'unknown')}`
          );
        }
        const id = basename(f, '.holo');
        const componentName = compileNativeFragment(parsed.ast, id);
        console.log(`  âœ“ fragments/${f} (native compiled â†’ ${componentName})`);
      } catch (err) {
        errorCount++;
        console.error(`  âœ— ${err instanceof Error ? err.message : String(err)}`);
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

  writeFileSync(OUT_PATH, out);

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
  writeFileSync(COMPONENTS_OUT_PATH, componentsOut);

  console.log(
    `\nWrote ${defs.length} view(s) → ${OUT_PATH}\n` +
      `Wrote ${slotEntries.length} component mount(s) → ${COMPONENTS_OUT_PATH} (${errorCount} error(s))`
  );

  if (errorCount > 0) {
    const msg = `viewreg:build: ${errorCount} panel .holo file(s) did not compile`;
    if (STRICT) throw new Error(`${msg} (strict mode — failing the gate)`);
    console.warn(
      `\n⚠ ${msg} — keeping last-good generated registry; deploy NOT blocked. Run --strict in CI.`
    );
  }
}

build();
