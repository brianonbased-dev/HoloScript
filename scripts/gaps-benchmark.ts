#!/usr/bin/env tsx
/**
 * GAPS Compilation Proof — Cross-backend benchmark
 * Compiles 3 representative .holo compositions to 18 backends,
 * captures timing, output size, and first 20 lines of generated code.
 */
import * as fs from 'fs';
import * as path from 'path';
import { performance } from 'perf_hooks';
import { HoloCompositionParser } from '../packages/core/src/parser/HoloCompositionParser';
import { UnityCompiler } from '../packages/core/src/compiler/UnityCompiler';
import { UnrealCompiler } from '../packages/core/src/compiler/UnrealCompiler';
import { GodotCompiler } from '../packages/core/src/compiler/GodotCompiler';
import { R3FCompiler } from '../packages/core/src/compiler/R3FCompiler';
import { BabylonCompiler } from '../packages/core/src/compiler/BabylonCompiler';
import { OpenXRCompiler } from '../packages/core/src/compiler/OpenXRCompiler';
import { VRChatCompiler } from '../packages/core/src/compiler/VRChatCompiler';
import { VisionOSCompiler } from '../packages/core/src/compiler/VisionOSCompiler';
import { AndroidXRCompiler } from '../packages/core/src/compiler/AndroidXRCompiler';
import { URDFCompiler } from '../packages/core/src/compiler/URDFCompiler';
import { SDFCompiler } from '../packages/core/src/compiler/SDFCompiler';
import { DTDLCompiler } from '../packages/core/src/compiler/DTDLCompiler';
import { WebGPUCompiler } from '../packages/core/src/compiler/WebGPUCompiler';
import { WASMCompiler } from '../packages/core/src/compiler/WASMCompiler';
import { PlayCanvasCompiler } from '../packages/core/src/compiler/PlayCanvasCompiler';
import { IOSCompiler } from '../packages/core/src/compiler/IOSCompiler';
import { AndroidCompiler } from '../packages/core/src/compiler/AndroidCompiler';

const REPO_ROOT = path.resolve(__dirname, '..');
const COMPOSITIONS_DIR = path.join(REPO_ROOT, 'benchmarks', 'cross-compilation', 'compositions');

interface Result {
  composition: string;
  target: string;
  success: boolean;
  timeMs: number;
  outputBytes: number;
  outputLines: number;
  preview: string;
  error?: string;
}

const COMPILERS: Record<string, new (opts?: any) => any> = {
  unity: UnityCompiler,
  unreal: UnrealCompiler,
  godot: GodotCompiler,
  r3f: R3FCompiler,
  babylon: BabylonCompiler,
  openxr: OpenXRCompiler,
  vrchat: VRChatCompiler,
  visionos: VisionOSCompiler,
  'android-xr': AndroidXRCompiler,
  urdf: URDFCompiler,
  sdf: SDFCompiler,
  dtdl: DTDLCompiler,
  webgpu: WebGPUCompiler,
  wasm: WASMCompiler,
  playcanvas: PlayCanvasCompiler,
  ios: IOSCompiler,
  android: AndroidCompiler,
};

// Select 3 diverse compositions: healthcare (AR), gaming (VR), robotics (Industrial)
const SELECTED = ['01-healthcare.holo', '04-gaming.holo', '15-robotics.holo'];

async function main() {
  const results: Result[] = [];
  const parser = new HoloCompositionParser();

  for (const file of SELECTED) {
    const filePath = path.join(COMPOSITIONS_DIR, file);
    if (!fs.existsSync(filePath)) {
      console.error(`Missing: ${filePath}`);
      continue;
    }
    const source = fs.readFileSync(filePath, 'utf-8');

    // Parse
    const parseStart = performance.now();
    const ast = parser.parse(source);
    const parseTime = performance.now() - parseStart;
    console.log(`\n=== ${file} — parsed in ${parseTime.toFixed(1)}ms ===`);

    for (const [target, CompilerClass] of Object.entries(COMPILERS)) {
      try {
        const compiler = new CompilerClass();
        const start = performance.now();
        // Pass undefined to skip RBAC (CompilerBase line 541)
        const output = compiler.compile(ast, undefined);
        const elapsed = performance.now() - start;

        const outputStr = typeof output === 'string' ? output : JSON.stringify(output, null, 2);
        const lines = outputStr.split('\n');

        results.push({
          composition: file,
          target,
          success: true,
          timeMs: Math.round(elapsed * 100) / 100,
          outputBytes: Buffer.byteLength(outputStr, 'utf-8'),
          outputLines: lines.length,
          preview: lines.slice(0, 15).join('\n'),
        });
        console.log(`  ✓ ${target.padEnd(14)} ${elapsed.toFixed(1)}ms  ${Buffer.byteLength(outputStr).toLocaleString()} bytes  ${lines.length} lines`);
      } catch (err: any) {
        results.push({
          composition: file,
          target,
          success: false,
          timeMs: 0,
          outputBytes: 0,
          outputLines: 0,
          preview: '',
          error: err.message?.slice(0, 200),
        });
        console.log(`  ✗ ${target.padEnd(14)} ERROR: ${err.message?.slice(0, 80)}`);
      }
    }
  }

  // Write results
  const outPath = path.join(REPO_ROOT, 'docs', 'compilation-proof.json');
  fs.writeFileSync(outPath, JSON.stringify(results, null, 2));
  console.log(`\nResults written to ${outPath}`);

  // Summary
  const total = results.length;
  const passed = results.filter(r => r.success).length;
  const failed = total - passed;
  const avgTime = results.filter(r => r.success).reduce((s, r) => s + r.timeMs, 0) / (passed || 1);
  const totalBytes = results.filter(r => r.success).reduce((s, r) => s + r.outputBytes, 0);

  console.log(`\n=== SUMMARY ===`);
  console.log(`Total:    ${total} compilations`);
  console.log(`Passed:   ${passed} (${((passed/total)*100).toFixed(1)}%)`);
  console.log(`Failed:   ${failed}`);
  console.log(`Avg time: ${avgTime.toFixed(1)}ms`);
  console.log(`Total output: ${(totalBytes / 1024).toFixed(1)} KB`);
}

main().catch(console.error);
