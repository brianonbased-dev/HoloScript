#!/usr/bin/env tsx
/**
 * Headless video renderer for @holoscript/video-tutorials
 *
 * Usage:
 *   tsx scripts/render-all.ts                     # render all compositions
 *   tsx scripts/render-all.ts --filter unity       # render matching compositions
 *   tsx scripts/render-all.ts --filter syntax      # render SyntaxIntroduction
 *   tsx scripts/render-all.ts --list               # list available compositions
 *
 * Output: packages/video-tutorials/out/*.mp4
 *
 * CI usage (GitHub Actions):
 *   pnpm --filter @holoscript/video-tutorials run render
 */

import { bundle } from '@remotion/bundler';
import { renderMedia, selectComposition, getCompositions } from '@remotion/renderer';
import path from 'path';
import { existsSync, mkdirSync } from 'fs';

// ─── Configuration ────────────────────────────────────────────────────────────

const ENTRY_POINT = path.resolve('./src/index.ts');
const OUTPUT_DIR = path.resolve('./out');

// Map composition ID → output filename
const COMPOSITION_MAP: Record<string, string> = {
  // Series 1 — Beginner
  SyntaxIntroduction: 'syntax-introduction.mp4',
  TraitsDeepDive: 'traits-deep-dive.mp4',
  StateAndLogic: 'state-and-logic.mp4',
  TimelinesAndAnimation: 'timelines-and-animation.mp4',
  NPCsAndDialogue: 'npcs-and-dialogue.mp4',
  TemplatesAndReuse: 'templates-and-reuse.mp4',

  // Series 2 — Compiler Demos
  UnityCompilerWalkthrough: 'unity-compiler-walkthrough.mp4',
  GodotCompilerWalkthrough: 'godot-compiler-walkthrough.mp4',
  BabylonCompilerWalkthrough: 'babylon-compiler-walkthrough.mp4',
  VisionOSCompilerWalkthrough: 'visionos-compiler-walkthrough.mp4',
  URDFCompilerWalkthrough: 'urdf-compiler-walkthrough.mp4',
  VRChatCompilerWalkthrough: 'vrchat-compiler-walkthrough.mp4',
  WebGPUCompilerWalkthrough: 'webgpu-compiler-walkthrough.mp4',
  R3FCompilerWalkthrough: 'r3f-compiler-walkthrough.mp4',
  iOSCompilerWalkthrough: 'ios-compiler-walkthrough.mp4',
  AndroidCompilerWalkthrough: 'android-compiler-walkthrough.mp4',
  OpenXRCompilerWalkthrough: 'openxr-compiler-walkthrough.mp4',
  DTDLCompilerWalkthrough: 'dtdl-compiler-walkthrough.mp4',
  UnrealCompilerWalkthrough: 'unreal-compiler-walkthrough.mp4',
  WASMCompilerWalkthrough: 'wasm-compiler-walkthrough.mp4',
  USDCompilerWalkthrough: 'usd-compiler-walkthrough.mp4',

  // Series 4 — Advanced
  PythonBindings: 'python-bindings.mp4',
  MCPServerIntegration: 'mcp-server-integration.mp4',
  LLMProviderSDK: 'llm-provider-sdk.mp4',
  SecuritySandbox: 'security-sandbox.mp4',
  CICDIntegration: 'ci-cd-integration.mp4',
  CustomTraitCreation: 'custom-trait-creation.mp4',
};

// ─── CLI args ─────────────────────────────────────────────────────────────────

const args = process.argv.slice(2);
const filterIndex = args.indexOf('--filter');
const filter = filterIndex >= 0 ? args[filterIndex + 1]?.toLowerCase() : null;
const listOnly = args.includes('--list');
const singleIndex = args.indexOf('--composition');
const singleId = singleIndex >= 0 ? args[singleIndex + 1] : null;

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  // Ensure output directory exists
  if (!existsSync(OUTPUT_DIR)) {
    mkdirSync(OUTPUT_DIR, { recursive: true });
  }

  console.log('📦 Bundling Remotion project...');
  const bundleLocation = await bundle({
    entryPoint: ENTRY_POINT,
    onProgress: (progress) => {
      process.stdout.write(`\r  Bundling: ${progress}%   `);
    },
  });
  console.log('\n✅ Bundle complete\n');

  // Get all registered compositions
  const allCompositions = await getCompositions(bundleLocation);

  if (listOnly) {
    console.log('Available compositions:');
    allCompositions.forEach((c) => console.log(`  • ${c.id}`));
    process.exit(0);
  }

  // Determine which to render
  let toRender = allCompositions;

  if (singleId) {
    toRender = allCompositions.filter((c) => c.id === singleId);
    if (toRender.length === 0) {
      console.error(`❌ Composition '${singleId}' not found`);
      process.exit(1);
    }
  } else if (filter) {
    toRender = allCompositions.filter((c) => c.id.toLowerCase().includes(filter));
    if (toRender.length === 0) {
      console.error(`❌ No compositions matching '${filter}'`);
      process.exit(1);
    }
  }

  console.log(`🎬 Rendering ${toRender.length} composition(s)...\n`);

  const results: { id: string; output: string; duration: number }[] = [];
  const errors: { id: string; error: string }[] = [];

  for (const comp of toRender) {
    const outputFilename =
      COMPOSITION_MAP[comp.id] ??
      `${comp.id.toLowerCase().replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`)}.mp4`.replace(
        /^-/,
        ''
      );
    const outputPath = path.join(OUTPUT_DIR, outputFilename);

    console.log(`▶ ${comp.id} → ${outputFilename}`);
    const startTime = Date.now();

    try {
      const selected = await selectComposition({
        serveUrl: bundleLocation,
        id: comp.id,
      });

      await renderMedia({
        composition: selected,
        serveUrl: bundleLocation,
        codec: 'h264',
        outputLocation: outputPath,
        onProgress: ({ progress, renderedFrames, encodedFrames }) => {
          const pct = Math.round(progress * 100);
          process.stdout.write(
            `\r  Progress: ${pct}% | rendered: ${renderedFrames} | encoded: ${encodedFrames}   `
          );
        },
        chromiumOptions: {
          headless: true,
          disableWebSecurity: false,
        },
      });

      const duration = ((Date.now() - startTime) / 1000).toFixed(1);
      console.log(`\n  ✅ Done in ${duration}s → ${outputPath}\n`);
      results.push({ id: comp.id, output: outputPath, duration: parseFloat(duration) });
    } catch (err) {
      console.error(`\n  ❌ Failed: ${err instanceof Error ? err.message : String(err)}\n`);
      errors.push({ id: comp.id, error: String(err) });
    }
  }

  // Summary
  console.log('─'.repeat(60));
  console.log(`\n📊 Render Summary:`);
  console.log(`  ✅ ${results.length} succeeded`);
  if (errors.length > 0) {
    console.log(`  ❌ ${errors.length} failed:`);
    errors.forEach((e) => console.log(`    • ${e.id}: ${e.error}`));
  }

  if (results.length > 0) {
    console.log('\n📁 Output files:');
    results.forEach((r) => console.log(`  ${r.output}`));
  }

  process.exit(errors.length > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
