/**
 * Locomotion `.hs` → Kotlin behavioral-parity test.
 *
 * The continuous-locomotion integration MATH (newYaw / gazeLength / normalize / groundRightX / newX /
 * newZ) is authored in quest-mr-logic/Locomotion.logic.hs and compiled to Kotlin by the canonical
 * Rust/WASM grammar (compile_to_kotlin), injected into StarterSampleActivity.kt.tmpl's
 * {{LOCOMOTION_LOGIC}} marker as a private `Locomotion` object. There is no JVM in CI, so we cannot
 * run the emitted Kotlin directly. Instead this test:
 *
 *  1. Asserts the emitted StarterSampleActivity.kt actually contains the .hs-compiled function
 *     signatures AND the shell's `Locomotion.*` call sites (so the wiring can't silently regress to
 *     inline hand-Kotlin arithmetic or empty). It also asserts the SDK calls + per-tick state STAY in
 *     the shell — the functional-core / imperative-shell split is the whole point.
 *  2. Runs a JS transliteration of BOTH the ORIGINAL hand-Kotlin math (the pre-migration
 *     updateLocomotion arithmetic, exactly as it was) and the NEW .hs-compiled math over a golden
 *     input table (forward / back / strafe / turn / diagonal / zero, several dt + speed values),
 *     asserting they agree on every input — i.e. the .hs compile preserved the locomotion behavior.
 *
 * If the .hs logic changes, update the NEW transliteration here to match and re-confirm parity with
 * the ORIGINAL (or, if behavior is intentionally changing, update BOTH the original baseline and the
 * expectation together — never silently).
 */
import { describe, it, expect } from 'vitest';
import { QuestCompiler } from '../QuestCompiler';
import { HoloCompositionParser } from '../../parser/HoloCompositionParser';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const testDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(testDir, '..', '..', '..', '..', '..');
const specPath = join(repoRoot, 'apps', 'quest-universal-qr-scanner', 'scanner.holo');

function emittedActivityKt(): string {
  const spec = readFileSync(specPath, 'utf8');
  const result = new HoloCompositionParser().parse(spec);
  const ast = (result as { success?: boolean; ast?: unknown }).ast ?? result;
  const emitted = new QuestCompiler().compile(ast as never, '');
  const key = Object.keys(emitted).find((k) => k.endsWith('StarterSampleActivity.kt'));
  if (!key) throw new Error('StarterSampleActivity.kt not in emitted Quest MR files');
  return emitted[key];
}

// ── Tunables (must mirror the Kotlin shell's literals in updateLocomotion) ─────────────────────
const MOVE_SPEED = 2.6;
const TURN_SPEED = 90;

// ── ORIGINAL hand-Kotlin math (the pre-migration inline arithmetic, transliterated) ────────────
// These are the formulas that lived directly in updateLocomotion() before this slice. They are the
// behavioral baseline the .hs compile must preserve. `fx`/`fz` are the raw (un-normalized)
// gaze-forward components the SDK Pose subtraction produced; the shell still computes those.
function origStep(
  px: number,
  pz: number,
  yaw: number,
  fwd: number,
  strafe: number,
  turn: number,
  rawFx: number,
  rawFz: number,
  moveSpeed: number,
  turnSpeed: number,
  dt: number
): { px: number; pz: number; yaw: number } {
  let nyaw = yaw;
  if (turn !== 0) nyaw += turn * turnSpeed * dt;
  let nx = px;
  let nz = pz;
  if (fwd !== 0 || strafe !== 0) {
    let fx = rawFx;
    let fz = rawFz;
    const len = Math.sqrt(fx * fx + fz * fz);
    if (len > 1e-4) {
      fx /= len;
      fz /= len;
      const rx = -fz;
      const rz = fx;
      nx += (fwd * fx + strafe * rx) * moveSpeed * dt;
      nz += (fwd * fz + strafe * rz) * moveSpeed * dt;
    }
  }
  return { px: nx, pz: nz, yaw: nyaw };
}

// ── NEW .hs-compiled math (transliterated from Locomotion.logic.hs) ─────────────────────────────
// One function per .hs function — the exact arithmetic emitted to the `Locomotion` Kotlin object.
const newYaw = (yaw: number, turn: number, turnSpeed: number, dt: number) =>
  yaw + turn * turnSpeed * dt;
const gazeLength = (fx: number, fz: number) => Math.sqrt(fx * fx + fz * fz);
const normalize = (component: number, len: number) => component / len;
const groundRightX = (fz: number) => -fz;
const newX = (
  x: number,
  fwd: number,
  fx: number,
  strafe: number,
  rx: number,
  moveSpeed: number,
  dt: number
) => x + (fwd * fx + strafe * rx) * moveSpeed * dt;
const newZ = (
  z: number,
  fwd: number,
  fz: number,
  strafe: number,
  rz: number,
  moveSpeed: number,
  dt: number
) => z + (fwd * fz + strafe * rz) * moveSpeed * dt;

// The shell composition (exactly the rewritten updateLocomotion control flow) over the .hs functions.
function hsStep(
  px: number,
  pz: number,
  yaw: number,
  fwd: number,
  strafe: number,
  turn: number,
  rawFx: number,
  rawFz: number,
  moveSpeed: number,
  turnSpeed: number,
  dt: number
): { px: number; pz: number; yaw: number } {
  let nyaw = yaw;
  if (turn !== 0) nyaw = newYaw(nyaw, turn, turnSpeed, dt);
  let nx = px;
  let nz = pz;
  if (fwd !== 0 || strafe !== 0) {
    const len = gazeLength(rawFx, rawFz);
    if (len > 1e-4) {
      const fx = normalize(rawFx, len);
      const fz = normalize(rawFz, len);
      const rx = groundRightX(fz);
      const rz = fx; // pure identity copy — no .hs function (matches the shell)
      nx = newX(nx, fwd, fx, strafe, rx, moveSpeed, dt);
      nz = newZ(nz, fwd, fz, strafe, rz, moveSpeed, dt);
    }
  }
  return { px: nx, pz: nz, yaw: nyaw };
}

// ── Golden input table: stick inputs × gaze heading × dt/speed (forward/back/strafe/turn/diagonal/
// zero) ────────────────────────────────────────────────────────────────────────────────────────
interface Case {
  name: string;
  px: number;
  pz: number;
  yaw: number;
  fwd: number;
  strafe: number;
  turn: number;
  rawFx: number;
  rawFz: number;
  dt: number;
}
// A handful of gaze-forward directions (raw, un-normalized) the SDK Pose subtraction could yield.
const GAZES: Array<[number, number]> = [
  [0, 1], // looking +Z
  [1, 0], // looking +X
  [0.7071, 0.7071], // 45°
  [-0.5, 0.866], // 120°
  [3, 4], // arbitrary magnitude (tests normalization)
];
const DTS = [0.0, 0.008, 0.016, 0.033, 0.1];
const STICKS: Array<{ name: string; fwd: number; strafe: number; turn: number }> = [
  { name: 'forward', fwd: 1, strafe: 0, turn: 0 },
  { name: 'back', fwd: -1, strafe: 0, turn: 0 },
  { name: 'strafe-right', fwd: 0, strafe: 1, turn: 0 },
  { name: 'strafe-left', fwd: 0, strafe: -1, turn: 0 },
  { name: 'turn-right', fwd: 0, strafe: 0, turn: 1 },
  { name: 'turn-left', fwd: 0, strafe: 0, turn: -1 },
  { name: 'diagonal', fwd: 1, strafe: 1, turn: 0 },
  { name: 'diagonal-back', fwd: -1, strafe: -1, turn: 0 },
  { name: 'move-and-turn', fwd: 1, strafe: 0, turn: 1 },
  { name: 'zero', fwd: 0, strafe: 0, turn: 0 },
];

const CASES: Case[] = [];
let g = 0;
for (const stick of STICKS) {
  for (const [rawFx, rawFz] of GAZES) {
    for (const dt of DTS) {
      g += 1;
      CASES.push({
        name: `${stick.name} gaze(${rawFx},${rawFz}) dt=${dt}`,
        px: 1.5 * ((g % 3) - 1), // vary the starting position so accumulation is exercised
        pz: -0.75 * ((g % 5) - 2),
        yaw: 30 * (g % 12),
        fwd: stick.fwd,
        strafe: stick.strafe,
        turn: stick.turn,
        rawFx,
        rawFz,
        dt,
      });
    }
  }
}

describe('Locomotion .hs → Kotlin emission', () => {
  const kt = emittedActivityKt();

  it('injects the .hs-compiled Locomotion math (not inline hand-Kotlin, not empty)', () => {
    expect(kt).toContain('@generated from logic/Locomotion.logic.hs (compile_to_kotlin)');
    expect(kt).toContain('private object Locomotion {');
    expect(kt).toContain(
      'fun newYaw(yaw: Float, turn: Float, turnSpeed: Float, dt: Float): Float {'
    );
    expect(kt).toContain('fun gazeLength(fx: Float, fz: Float): Float {');
    expect(kt).toContain('fun normalize(component: Float, len: Float): Float {');
    expect(kt).toContain('fun groundRightX(fz: Float): Float {');
    expect(kt).toContain(
      'fun newX(x: Float, fwd: Float, fx: Float, strafe: Float, rx: Float, moveSpeed: Float, dt: Float): Float {'
    );
    expect(kt).toContain(
      'fun newZ(z: Float, fwd: Float, fz: Float, strafe: Float, rz: Float, moveSpeed: Float, dt: Float): Float {'
    );
  });

  it('emits the .hs numeric forms: f-suffix literals, preserved grouping, kotlin.math.sqrt', () => {
    expect(kt).toContain('return yaw + turn * turnSpeed * dt');
    expect(kt).toContain('return kotlin.math.sqrt(fx * fx + fz * fz)');
    expect(kt).toContain('return component / len');
    expect(kt).toContain('return -fz');
    // The grouping MUST survive (parser drops parens; emitter restores them).
    expect(kt).toContain('return x + (fwd * fx + strafe * rx) * moveSpeed * dt');
    expect(kt).toContain('return z + (fwd * fz + strafe * rz) * moveSpeed * dt');
  });

  it('wires updateLocomotion() to call the .hs functions for ALL math', () => {
    expect(kt).toContain('playerYaw = Locomotion.newYaw(playerYaw, turn, turnSpeed, dt)');
    expect(kt).toContain('val len = Locomotion.gazeLength(rawFx, rawFz)');
    expect(kt).toContain('val fx = Locomotion.normalize(rawFx, len)');
    expect(kt).toContain('val fz = Locomotion.normalize(rawFz, len)');
    expect(kt).toContain('val rx = Locomotion.groundRightX(fz)');
    expect(kt).toContain('playerX = Locomotion.newX(playerX, fwd, fx, strafe, rx, moveSpeed, dt)');
    expect(kt).toContain('playerZ = Locomotion.newZ(playerZ, fwd, fz, strafe, rz, moveSpeed, dt)');
  });

  it('keeps state + SDK calls in the imperative shell (functional-core / imperative-shell)', () => {
    // The SDK gaze pose, the view-origin write, the controller query, and System.nanoTime stay in the
    // shell — they are NOT inside the Locomotion object.
    expect(kt).toContain('val head = scene.getViewerPose()');
    expect(kt).toContain('scene.setViewOrigin(playerX, 0f, playerZ, playerYaw)');
    expect(kt).toContain('Query.where { has(Controller.id) }.forEach<Controller>');
    expect(kt).toContain('val now = System.nanoTime()');
    // The Locomotion object is pure math: no SDK/host symbols leak into it.
    const objStart = kt.indexOf('private object Locomotion {');
    const objEnd = kt.indexOf('\n  }', objStart);
    const objBody = kt.slice(objStart, objEnd);
    expect(objBody).not.toContain('scene.');
    expect(objBody).not.toContain('System.nanoTime');
    expect(objBody).not.toContain('Query.');
  });
});

describe('Locomotion .hs math ≡ original hand-Kotlin (behavioral parity)', () => {
  it.each(CASES)('step matches: $name', (c) => {
    const orig = origStep(
      c.px,
      c.pz,
      c.yaw,
      c.fwd,
      c.strafe,
      c.turn,
      c.rawFx,
      c.rawFz,
      MOVE_SPEED,
      TURN_SPEED,
      c.dt
    );
    const hs = hsStep(
      c.px,
      c.pz,
      c.yaw,
      c.fwd,
      c.strafe,
      c.turn,
      c.rawFx,
      c.rawFz,
      MOVE_SPEED,
      TURN_SPEED,
      c.dt
    );
    // Float math composed in the identical order → expect bit-exact agreement.
    expect(hs.px).toBe(orig.px);
    expect(hs.pz).toBe(orig.pz);
    expect(hs.yaw).toBe(orig.yaw);
  });
});
