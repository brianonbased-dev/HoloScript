import { execFile } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import * as path from 'node:path';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const execFileAsync = promisify(execFile);
const testDir = path.dirname(fileURLToPath(import.meta.url));
const packageRoot = path.resolve(testDir, '../..');
const repoRoot = path.resolve(packageRoot, '../..');
const cliSource = path.join(packageRoot, 'src/cli.ts');
const tsxCli = path.join(repoRoot, 'node_modules/tsx/dist/cli.mjs');

async function runCli(args: string[]) {
  return execFileAsync(process.execPath, [tsxCli, '--no-cache', cliSource, ...args], {
    cwd: repoRoot,
    maxBuffer: 1024 * 1024,
    timeout: 90_000,
  });
}

function writeSmokeHolo(tempDir: string): string {
  const sourcePath = path.join(tempDir, 'scene.holo');
  writeFileSync(
    sourcePath,
    `composition "Compile Output Parent Smoke" {
      object "Cube" {
        geometry: "cube"
        position: [0, 1, 0]
      }
    }`
  );
  return sourcePath;
}

describe('CLI compile output writing', () => {
  it('creates parent directories for single-file target output', async () => {
    const tempDir = mkdtempSync(path.join(tmpdir(), 'holoscript-cli-compile-output-'));

    try {
      const sourcePath = writeSmokeHolo(tempDir);
      const outputPath = path.join(tempDir, 'nested', 'captures', 'scene-r3f.json');

      const result = await runCli(['compile', sourcePath, '--target', 'r3f', '-o', outputPath]);

      expect(result.stdout).toContain('R3F compilation successful');
      expect(existsSync(outputPath)).toBe(true);
      const scene = JSON.parse(readFileSync(outputPath, 'utf8')) as {
        children?: Array<{ id?: string; type?: string }>;
      };
      expect(scene.children?.some((child) => child.type === 'mesh')).toBe(true);
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it('writes Android XR multi-file output directories for the canonical target', async () => {
    const tempDir = mkdtempSync(path.join(tmpdir(), 'holoscript-cli-compile-output-'));

    try {
      const sourcePath = writeSmokeHolo(tempDir);
      const outputDir = path.join(tempDir, 'nested', 'android-xr');

      const result = await runCli([
        'compile',
        sourcePath,
        '--target',
        'android-xr',
        '-o',
        outputDir,
      ]);

      expect(result.stdout).toContain('AndroidXR compilation successful');
      expect(existsSync(path.join(outputDir, 'GeneratedXRActivity.kt'))).toBe(true);
      expect(existsSync(path.join(outputDir, 'XRSceneState.kt'))).toBe(true);
      expect(existsSync(path.join(outputDir, 'XRNodeFactory.kt'))).toBe(true);
      expect(existsSync(path.join(outputDir, 'AndroidManifest.xml'))).toBe(true);
      expect(existsSync(path.join(outputDir, 'build.gradle.kts'))).toBe(true);
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it('normalizes legacy Android XR target aliases', async () => {
    const tempDir = mkdtempSync(path.join(tmpdir(), 'holoscript-cli-compile-output-'));

    try {
      const sourcePath = writeSmokeHolo(tempDir);
      const outputDir = path.join(tempDir, 'nested', 'androidxr');

      const result = await runCli([
        'compile',
        sourcePath,
        '--target',
        'androidxr',
        '-o',
        outputDir,
      ]);

      expect(result.stdout).toContain('AndroidXR compilation successful');
      expect(existsSync(path.join(outputDir, 'GeneratedXRActivity.kt'))).toBe(true);
      expect(existsSync(path.join(outputDir, 'AndroidManifest.xml'))).toBe(true);
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it('writes Android multi-file output directories', async () => {
    const tempDir = mkdtempSync(path.join(tmpdir(), 'holoscript-cli-compile-output-'));

    try {
      const sourcePath = writeSmokeHolo(tempDir);
      const outputDir = path.join(tempDir, 'nested', 'android');

      const result = await runCli(['compile', sourcePath, '--target', 'android', '-o', outputDir]);

      expect(result.stdout).toContain('Android compilation successful');
      expect(existsSync(path.join(outputDir, 'GeneratedXRActivity.kt'))).toBe(true);
      expect(existsSync(path.join(outputDir, 'XRSceneState.kt'))).toBe(true);
      expect(existsSync(path.join(outputDir, 'XRNodeFactory.kt'))).toBe(true);
      expect(existsSync(path.join(outputDir, 'AndroidManifest.xml'))).toBe(true);
      expect(existsSync(path.join(outputDir, 'build.gradle.kts'))).toBe(true);
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it('writes iOS multi-file output directories', async () => {
    const tempDir = mkdtempSync(path.join(tmpdir(), 'holoscript-cli-compile-output-'));

    try {
      const sourcePath = writeSmokeHolo(tempDir);
      const outputDir = path.join(tempDir, 'nested', 'ios');

      const result = await runCli(['compile', sourcePath, '--target', 'ios', '-o', outputDir]);

      expect(result.stdout).toContain('iOS compilation successful');
      expect(existsSync(path.join(outputDir, 'ContentView.swift'))).toBe(true);
      expect(existsSync(path.join(outputDir, 'HoloScriptScene.swift'))).toBe(true);
      expect(existsSync(path.join(outputDir, 'HoloScriptState.swift'))).toBe(true);
      expect(existsSync(path.join(outputDir, 'Info.plist'))).toBe(true);
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it('writes Unreal multi-file output directories', async () => {
    const tempDir = mkdtempSync(path.join(tmpdir(), 'holoscript-cli-compile-output-'));

    try {
      const sourcePath = writeSmokeHolo(tempDir);
      const outputDir = path.join(tempDir, 'nested', 'unreal');

      const result = await runCli(['compile', sourcePath, '--target', 'unreal', '-o', outputDir]);

      expect(result.stdout).toContain('Unreal compilation successful');
      expect(existsSync(path.join(outputDir, 'HoloScriptActor.h'))).toBe(true);
      expect(existsSync(path.join(outputDir, 'HoloScriptActor.cpp'))).toBe(true);
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it('writes AR output with parent directory creation', async () => {
    const tempDir = mkdtempSync(path.join(tmpdir(), 'holoscript-cli-compile-output-'));

    try {
      const sourcePath = writeSmokeHolo(tempDir);
      const outputPath = path.join(tempDir, 'nested', 'ar', 'scene.js');

      const result = await runCli(['compile', sourcePath, '--target', 'ar', '-o', outputPath]);
      const output = readFileSync(outputPath, 'utf8');

      expect(result.stdout).toContain('AR compilation successful');
      expect(output).toContain('ARRuntime');
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it('writes PlayCanvas output with parent directory creation', async () => {
    const tempDir = mkdtempSync(path.join(tmpdir(), 'holoscript-cli-compile-output-'));

    try {
      const sourcePath = writeSmokeHolo(tempDir);
      const outputPath = path.join(tempDir, 'nested', 'playcanvas', 'scene.ts');

      const result = await runCli([
        'compile',
        sourcePath,
        '--target',
        'playcanvas',
        '-o',
        outputPath,
      ]);
      const output = readFileSync(outputPath, 'utf8');

      expect(result.stdout).toContain('PlayCanvas compilation successful');
      expect(output).toContain('pc.Application');
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it('writes USD output with parent directory creation', async () => {
    const tempDir = mkdtempSync(path.join(tmpdir(), 'holoscript-cli-compile-output-'));

    try {
      const sourcePath = writeSmokeHolo(tempDir);
      const outputPath = path.join(tempDir, 'nested', 'usd', 'scene.usda');

      const result = await runCli(['compile', sourcePath, '--target', 'usd', '-o', outputPath]);

      expect(result.stdout).toContain('USD compilation successful');
      expect(readFileSync(outputPath, 'utf8')).toContain('#usda');
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it('writes USDZ packages with parent directory creation', async () => {
    const tempDir = mkdtempSync(path.join(tmpdir(), 'holoscript-cli-compile-output-'));

    try {
      const sourcePath = writeSmokeHolo(tempDir);
      const outputPath = path.join(tempDir, 'nested', 'usdz', 'scene.usdz');

      const result = await runCli(['compile', sourcePath, '--target', 'usdz', '-o', outputPath]);
      const output = readFileSync(outputPath);

      expect(result.stdout).toContain('USDZ compilation successful');
      expect(output.byteLength).toBeGreaterThan(0);
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it('writes 3DGS GLB output with parent directory creation', async () => {
    const tempDir = mkdtempSync(path.join(tmpdir(), 'holoscript-cli-compile-output-'));

    try {
      const sourcePath = writeSmokeHolo(tempDir);
      const outputPath = path.join(tempDir, 'nested', '3dgs', 'scene.glb');

      const result = await runCli(['compile', sourcePath, '--target', '3dgs', '-o', outputPath]);
      const output = readFileSync(outputPath);

      expect(result.stdout).toContain('3DGS compilation successful');
      expect(output.subarray(0, 4).toString('utf8')).toBe('glTF');
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it('writes VRR JavaScript output with parent directory creation', async () => {
    const tempDir = mkdtempSync(path.join(tmpdir(), 'holoscript-cli-compile-output-'));

    try {
      const sourcePath = writeSmokeHolo(tempDir);
      const outputPath = path.join(tempDir, 'nested', 'vrr', 'scene.js');

      const result = await runCli(['compile', sourcePath, '--target', 'vrr', '-o', outputPath]);
      const output = readFileSync(outputPath, 'utf8');

      expect(result.stdout).toContain('VRR compilation successful');
      expect(output).toContain('VRRRuntime');
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it('writes multi-layer bundle output and normalizes aliases', async () => {
    const tempDir = mkdtempSync(path.join(tmpdir(), 'holoscript-cli-compile-output-'));

    try {
      const sourcePath = writeSmokeHolo(tempDir);
      const outputDir = path.join(tempDir, 'nested', 'multi-layer');

      const result = await runCli([
        'compile',
        sourcePath,
        '--target',
        'multilayer',
        '-o',
        outputDir,
      ]);

      expect(result.stdout).toContain('Multi-layer compilation successful');
      expect(existsSync(path.join(outputDir, 'vr.js'))).toBe(true);
      expect(existsSync(path.join(outputDir, 'vrr.js'))).toBe(true);
      expect(existsSync(path.join(outputDir, 'ar.js'))).toBe(true);
      expect(existsSync(path.join(outputDir, 'multi-layer.json'))).toBe(true);
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });
});
