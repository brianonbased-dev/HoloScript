import { execFile } from 'node:child_process';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
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
const labRoot = path.join(repoRoot, 'experiments/format-realism-gauntlet');

async function runCli(args: string[]) {
  return execFileAsync(process.execPath, [tsxCli, cliSource, ...args], {
    cwd: repoRoot,
    env: process.env,
    maxBuffer: 1024 * 1024,
    timeout: 120_000,
  });
}

describe('Three.js template output', () => {
  it('preserves template geometry and material overrides in the format gauntlet', async () => {
    const holo = path.join(labRoot, 'humanoid-rock-throw.holo');
    const outDir = await fs.mkdtemp(path.join(os.tmpdir(), 'holoscript-threejs-templates-'));
    const outFile = path.join(outDir, 'humanoid-rock-throw.js');

    try {
      const compile = await runCli(['compile', holo, '--target', 'threejs', '-o', outFile]);
      expect(compile.stdout).toContain('Compilation successful');

      const code = await fs.readFile(outFile, 'utf8');
      expect(code).toContain('const Ground_geometry = new THREE.PlaneGeometry(14, 10);');
      expect(code).toContain(
        "const Ground_material = new THREE.MeshStandardMaterial({ color: '#1a2330', roughness: 0.85, metalness: 0.05 });"
      );
      expect(code).toContain('const HumanoidTorso_geometry = new THREE.CapsuleGeometry');
      expect(code).toContain(
        "const HumanoidTorso_material = new THREE.MeshStandardMaterial({ color: '#7aa2f7'"
      );
      expect(code).toContain('const Rock_geometry = new THREE.DodecahedronGeometry(0.14);');
      expect(code).toContain(
        "const Rock_material = new THREE.MeshStandardMaterial({ color: '#7c6f64'"
      );
      expect(code).toContain(
        'const Target_geometry = new THREE.CylinderGeometry(0.45, 0.45, 1.8, 32);'
      );
      expect(code).toContain('const TargetBullseye_geometry = new THREE.RingGeometry');
      expect(code).not.toContain(
        "const Rock_material = new THREE.MeshStandardMaterial({ color: '#ffffff'"
      );
    } finally {
      await fs.rm(outDir, { recursive: true, force: true });
    }
  }, 180_000);
});
