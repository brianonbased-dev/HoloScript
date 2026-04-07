/**
 * HoloScript NextJS Compiler
 *
 * Compiles .holo compositions into Next.js App Router page files.
 * Wraps Native2DCompiler (format: 'react') with Next.js conventions:
 * - 'use client' directive
 * - next/link, next/navigation imports
 * - Metadata exports from @metadata trait
 * - Layout generation from @layout trait
 * - @page trait for route configuration
 *
 * @module NextJSCompiler
 */

import { Native2DCompiler, type Native2DCompilerOptions } from './Native2DCompiler';
import type { HoloComposition, HoloObjectTrait } from '../parser/HoloCompositionTypes';

export interface NextJSCompilerOptions {
  outputDir?: string;
  slots?: Record<string, { component: string; importPath: string }>;
}

export interface NextJSCompileResult {
  /** Relative path for the generated file (e.g., 'pipeline/page.tsx') */
  path: string;
  /** Generated file content */
  code: string;
}

/**
 * Extract a trait config from a composition's root-level traits.
 */
function findTrait(composition: HoloComposition, traitName: string): Record<string, unknown> | null {
  const traits = (composition as unknown as { traits?: HoloObjectTrait[] }).traits;
  if (!traits) return null;
  const found = traits.find((t) => t.name === traitName);
  return found?.config as Record<string, unknown> || null;
}

/**
 * Compile a HoloComposition to a Next.js App Router page.
 */
export function compileToNextJS(
  composition: HoloComposition,
  options: NextJSCompilerOptions = {}
): NextJSCompileResult {
  const compiler = new Native2DCompiler();

  // Extract @page and @metadata traits
  const pageTrait = findTrait(composition, 'page');
  const metaTrait = findTrait(composition, 'metadata');

  const route = (pageTrait?.route as string) || `/${composition.name.toLowerCase().replace(/\s+/g, '-')}`;
  const isClient = pageTrait?.client !== false; // default to client component

  // Build slot map from options + any @slot traits in the composition
  const slotMap = options.slots || {};

  // Compile the React component via Native2DCompiler
  const compilerOptions: Native2DCompilerOptions = {
    format: 'react',
    useUIComponents: true,
    slots: slotMap,
  };

  const elements = composition.ui?.elements || composition.objects || [];
  const componentCode = compiler.generateReactComponent(
    composition.name,
    elements,
    composition,
    compilerOptions
  );

  // Wrap in Next.js conventions
  const lines: string[] = [];

  // 'use client' directive
  if (isClient) {
    lines.push("'use client';");
    lines.push('');
  }

  // Inject the component code (which already has imports)
  lines.push(componentCode);

  // Generate metadata export if @metadata trait exists
  if (metaTrait) {
    const metaEntries: string[] = [];
    if (metaTrait.title) metaEntries.push(`  title: ${JSON.stringify(metaTrait.title)},`);
    if (metaTrait.description) metaEntries.push(`  description: ${JSON.stringify(metaTrait.description)},`);

    lines.push('');
    lines.push(`export const metadata = {`);
    lines.push(metaEntries.join('\n'));
    lines.push(`};`);
  }

  // Determine output path from route
  const routePath = route.replace(/^\//, '') || 'index';
  const filePath = `${routePath}/page.tsx`;

  return {
    path: filePath,
    code: lines.join('\n'),
  };
}

/**
 * Compile multiple .holo compositions to Next.js pages.
 */
export function compileAllToNextJS(
  compositions: Array<{ name: string; composition: HoloComposition }>,
  options: NextJSCompilerOptions = {}
): NextJSCompileResult[] {
  return compositions.map(({ composition }) => compileToNextJS(composition, options));
}
