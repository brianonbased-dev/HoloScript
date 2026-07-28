import { readFileSync } from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PHYSICS_DEFAULTS, PhysicsWorldImpl } from '@holoscript/engine/physics';
import { canonicalizeHeadlessValue, hashHeadlessValue } from '@holoscript/engine/runtime';
import { describe, expect, it, vi } from 'vitest';
import {
  HOLOLAND_PHYSICS_OBSERVER_SCHEMA,
  HOLO_CPU_PHYSICS_ENGINE,
  HOLO_CPU_PHYSICS_RECEIPT_SCHEMA,
  executeHoloCpuPhysicsReceipt,
  verifyHoloCpuPhysicsReceipt,
  type HoloCpuPhysicsExecutionReceipt,
  type HoloCpuPhysicsObserverFrame,
} from '../holo-cpu-physics-receipt';
import { executeHoloWorldProjection } from '../holo-headless-world-projection';

const testDir = path.dirname(fileURLToPath(import.meta.url));
const villageSource = readFileSync(
  path.join(testDir, 'fixtures/model-village/village.holo'),
  'utf8'
);
const executionOptions = {
  runSeed: 'model-village-physics-001',
  steps: 600,
} as const;

type DeepMutable<T> = T extends readonly []
  ? []
  : T extends readonly [unknown, ...unknown[]]
    ? { -readonly [Key in keyof T]: DeepMutable<T[Key]> }
    : T extends readonly (infer U)[]
      ? DeepMutable<U>[]
      : T extends object
        ? { -readonly [Key in keyof T]: DeepMutable<T[Key]> }
        : T;

function clone<T>(value: T): DeepMutable<T> {
  return JSON.parse(canonicalizeHeadlessValue(value)) as DeepMutable<T>;
}

function framePreimage(frame: HoloCpuPhysicsObserverFrame) {
  const { frameHash: _frameHash, ...preimage } = frame;
  return preimage;
}

function receiptPreimage(receipt: HoloCpuPhysicsExecutionReceipt) {
  const { receiptCommitment: _receiptCommitment, ...preimage } = receipt;
  return preimage;
}

function resealTamperedTerminalTransform(
  receipt: DeepMutable<HoloCpuPhysicsExecutionReceipt>
): void {
  const frame = receipt.observer.frames[receipt.observer.frames.length - 1];
  frame.transformStateHash = hashHeadlessValue(
    frame.bodies.map((body) => ({
      id: body.id,
      transform: body.transform,
      linearVelocity: body.linearVelocity,
      angularVelocity: body.angularVelocity,
    }))
  );
  frame.frameHash = hashHeadlessValue(framePreimage(frame));
  receipt.observer.terminalFrameHash = frame.frameHash;
  receipt.evidence.deterministicStepping.frameHashChainTerminal = frame.frameHash;
  receipt.result.terminalFrameHash = frame.frameHash;
  receipt.result.trajectoryHash = hashHeadlessValue(receipt.observer.frames);
  receipt.receiptCommitment = hashHeadlessValue(receiptPreimage(receipt));
}

describe('source-backed deterministic CPU physics receipts', () => {
  it('executes one sorted PhysicsWorldImpl registration path identically across three runs', () => {
    const createBody = vi.spyOn(PhysicsWorldImpl.prototype, 'createBody');
    try {
      const runs = Array.from({ length: 3 }, () =>
        executeHoloCpuPhysicsReceipt(villageSource, executionOptions)
      );
      expect(new Set(runs.map((run) => run.receiptCommitment)).size).toBe(1);
      expect(new Set(runs.map((run) => run.result.trajectoryHash)).size).toBe(1);
      expect(createBody).toHaveBeenCalledTimes(15);

      const receipt = runs[0];
      expect(receipt.receiptCommitment).toBe(
        '44cd1789119b4dcfcb8f4dad5bf1c1fc81a6f8f23e97901be25650577998080d'
      );
      expect(receipt.result.trajectoryHash).toBe(
        'b4531119dd9b37c2fb85811f2437fb8859bd4f024427bcfffffba347df1c4e2d'
      );
      expect(receipt).toMatchObject({
        schema: HOLO_CPU_PHYSICS_RECEIPT_SCHEMA,
        engine: HOLO_CPU_PHYSICS_ENGINE,
        simulation: {
          fixedTimestepSeconds: 1 / 60,
          steps: 600,
          maxSubsteps: 1,
          runSeed: executionOptions.runSeed,
          randomnessUsed: false,
          engineDefaultsHash: expect.stringMatching(/^[a-f0-9]{64}$/),
        },
        observer: {
          schema: HOLOLAND_PHYSICS_OBSERVER_SCHEMA,
          target: 'HoloLand',
          authority: 'read-only-observer',
          canonicalMutationAllowed: false,
        },
        result: {
          bodyCount: 5,
          frameCount: 601,
          contactEventCount: 1768,
        },
        claimBoundary: {
          physicsWorldImplCpuExecuted: true,
          singleBodyRegistrationPath: true,
          canonicalExperimentMutated: false,
          frictionMaterialRegistered: true,
          frictionResponseClaimed: false,
          cylinderCollisionClaimed: true,
          authoredEulerDegreeConversionExecuted: false,
          nestedObjectTransformCompositionExecuted: false,
          simulationContractClassExecuted: false,
          engineBuildDigestBound: false,
          nativeWebGpuPhysicsClaimed: false,
          renderingExecuted: false,
          realisticRenderingClaimed: false,
        },
      });
      expect(receipt.registration.bodies.map((body) => body.id)).toEqual([
        'cistern',
        'commons',
        'external-valve',
        'resident-1',
        'resident-2',
      ]);
      expect(receipt.registration.bodies.find((body) => body.id === 'commons')).toMatchObject({
        motionType: 'static',
        motionTypeSource: 'explicit-static',
        authoredMassKg: 0,
        effectiveMassKg: 0,
        shape: {
          type: 'cylinder',
          radius: 6,
          height: 0.3,
          axis: 'y',
        },
      });
      expect(receipt.registration.bodies.find((body) => body.id === 'cistern')).toMatchObject({
        motionType: 'kinematic',
        motionTypeSource: 'explicit-kinematic',
        authoredMassKg: 450,
        effectiveMassKg: 0,
        shape: {
          type: 'cylinder',
          radius: 1.1,
          height: 1.8,
          axis: 'y',
        },
      });

      const initialFrame = receipt.observer.frames[0];
      const finalFrame = receipt.observer.frames[receipt.observer.frames.length - 1];
      expect(initialFrame.previousFrameHash).toBe(receipt.observer.genesisHash);
      expect(finalFrame.previousFrameHash).toBe(
        receipt.observer.frames[receipt.observer.frames.length - 2].frameHash
      );
      for (const hash of [
        finalFrame.transformStateHash,
        finalFrame.contactStateHash,
        finalFrame.sleepingStateHash,
        finalFrame.frameHash,
      ]) {
        expect(hash).toMatch(/^[a-f0-9]{64}$/);
      }
      for (const residentId of ['resident-1', 'resident-2']) {
        const resident = finalFrame.bodies.find((body) => body.id === residentId);
        expect(resident).toBeDefined();
        expect(resident!.transform.position[1]).toBeGreaterThan(0.19);
        expect(resident!.transform.position[1]).toBeLessThan(0.22);
        expect(resident!.linearVelocity).toEqual([0, 0, 0]);
        expect(resident!.angularVelocity).toEqual([0, 0, 0]);
        expect(resident!.isSleeping).toBe(true);
      }
      expect(receipt.result.sleepingBodyIds).toEqual(['resident-1', 'resident-2']);
      expect(receipt.result.contactEventCount).toBeGreaterThan(0);
      expect(
        receipt.observer.frames.some((frame) =>
          frame.contacts.some(
            (contact) =>
              contact.bodyA === 'commons' &&
              (contact.bodyB === 'resident-1' || contact.bodyB === 'resident-2')
          )
        )
      ).toBe(true);
      expect(
        receipt.observer.frames
          .flatMap((frame) => frame.contacts)
          .some((contact) =>
            contact.contacts.some((point) =>
              [...point.position, ...point.normal].some((value) => Object.is(value, -0))
            )
          )
      ).toBe(false);
      expect(Object.isFrozen(receipt)).toBe(true);
      expect(Object.isFrozen(receipt.observer.frames)).toBe(true);
      expect(Object.isFrozen(finalFrame.bodies[0].transform.position)).toBe(true);
    } finally {
      createBody.mockRestore();
    }
  });

  it('converts authored Euler degrees and composes nested transforms into world space', () => {
    const receipt = executeHoloCpuPhysicsReceipt(
      `
        composition "NestedPhysics" {
          object "parent" {
            position: [100, 0, 50]
            rotation: [0, 90, 0]
            scale: [2, 2, 2]

            object "child" @collidable {
              geometry: "box"
              position: [5, 2, 0]
              rotation: [0, 90, 0]
              scale: [2, 4, 6]
              @physics { mass: 0 kinematic: true }
            }
          }
          object "multi-axis" @kinematic @collidable {
            geometry: "box"
            position: [200, 200, 200]
            rotation: [10, 20, 30]
          }
        }
      `,
      { runSeed: 'nested-transform', steps: 1 }
    );
    const child = receipt.registration.bodies.find((body) => body.id === 'child')!;
    const multiAxis = receipt.registration.bodies.find((body) => body.id === 'multi-axis')!;

    expect(child).toMatchObject({
      id: 'child',
      motionType: 'kinematic',
      motionTypeSource: 'explicit-kinematic',
      effectiveMassKg: 0,
      shape: {
        type: 'box',
        halfExtents: [2, 4, 6],
      },
    });
    expect(child.initialTransform.position[0]).toBeCloseTo(100, 12);
    expect(child.initialTransform.position[1]).toBeCloseTo(4, 12);
    expect(child.initialTransform.position[2]).toBeCloseTo(40, 12);
    expect(child.initialTransform.rotation[0]).toBeCloseTo(0, 12);
    expect(child.initialTransform.rotation[1]).toBeCloseTo(1, 12);
    expect(child.initialTransform.rotation[2]).toBeCloseTo(0, 12);
    expect(Math.abs(child.initialTransform.rotation[3])).toBeLessThan(1e-12);
    expect(multiAxis).toMatchObject({
      motionType: 'kinematic',
      motionTypeSource: 'explicit-kinematic',
      authoredMassKg: null,
      effectiveMassKg: 0,
    });
    expect(multiAxis.initialTransform.rotation[0]).toBeCloseTo(0.03813457647485015, 12);
    expect(multiAxis.initialTransform.rotation[1]).toBeCloseTo(0.18930785741200004, 12);
    expect(multiAxis.initialTransform.rotation[2]).toBeCloseTo(0.2392983377447303, 12);
    expect(multiAxis.initialTransform.rotation[3]).toBeCloseTo(0.9515485246437886, 12);
    expect(receipt.evidence.geometryMapping.transformOperations).toEqual({
      authoredEulerConversions: 3,
      nestedObjectCompositions: 1,
    });
    expect(receipt.claimBoundary.authoredEulerDegreeConversionExecuted).toBe(true);
    expect(receipt.claimBoundary.nestedObjectTransformCompositionExecuted).toBe(true);

    expect(() =>
      executeHoloCpuPhysicsReceipt(
        `
          composition "UnrepresentableShear" {
            object "scaled-parent" {
              scale: [2, 3, 4]
              object "rotated-child" @kinematic @collidable {
                geometry: "box"
                rotation: [10, 20, 30]
              }
            }
          }
        `,
        { runSeed: 'unrepresentable-shear', steps: 1 }
      )
    ).toThrow(/introduce shear/);
  });

  it('preserves explicit motion modes, collision filters, and authored damping', () => {
    const receipt = executeHoloCpuPhysicsReceipt(
      `
        composition "PhysicsProperties" {
          object "explicit-kinematic" @collidable {
            geometry: "sphere"
            position: [-4, 2, 0]
            @physics {
              mass: 0
              kinematic: true
              collision_group: 4
              collision_mask: 0
              linear_damping: 0.2
              angular_damping: 0.3
            }
          }
          object "property-static" @collidable {
            geometry: "box"
            position: [0, 0, 0]
            static: true
          }
          object "trait-static" @collidable @static {
            geometry: "box"
            position: [4, 0, 0]
          }
        }
      `,
      { runSeed: 'physics-properties', steps: 2 }
    );
    const byId = new Map(receipt.registration.bodies.map((body) => [body.id, body]));

    expect(byId.get('explicit-kinematic')).toMatchObject({
      motionType: 'kinematic',
      motionTypeSource: 'explicit-kinematic',
      authoredMassKg: 0,
      effectiveMassKg: 0,
      filter: { group: 4, mask: 0 },
      damping: { linear: 0.2, angular: 0.3 },
    });
    expect(byId.get('property-static')).toMatchObject({
      motionType: 'static',
      motionTypeSource: 'explicit-static',
      effectiveMassKg: 0,
    });
    expect(byId.get('trait-static')).toMatchObject({
      motionType: 'static',
      motionTypeSource: 'explicit-static',
      effectiveMassKg: 0,
    });
    expect(receipt.result.contactEventCount).toBe(0);
  });

  it('returns only a fresh replay-derived observer after source-backed verification', () => {
    const receipt = executeHoloCpuPhysicsReceipt(villageSource, executionOptions);
    const verdict = verifyHoloCpuPhysicsReceipt(receipt, {
      expectedSource: villageSource,
      expectedRunSeed: executionOptions.runSeed,
      expectedSteps: executionOptions.steps,
    });

    expect(verdict.valid).toBe(true);
    expect(verdict.errors).toEqual([]);
    expect(verdict.observer).toBeDefined();
    expect(verdict.observer).not.toBe(receipt.observer);
    expect(canonicalizeHeadlessValue(verdict.observer)).toBe(
      canonicalizeHeadlessValue(receipt.observer)
    );
    expect(Object.isFrozen(verdict.observer)).toBe(true);
  });

  it('fails dark when a transform is tampered and the attacker reseals every outer hash', () => {
    const original = executeHoloCpuPhysicsReceipt(villageSource, executionOptions);
    const tampered = clone(original);
    const finalFrame = tampered.observer.frames[tampered.observer.frames.length - 1];
    const resident = finalFrame.bodies.find((body) => body.id === 'resident-1')!;
    resident.transform.position[1] += 4;
    resealTamperedTerminalTransform(tampered);

    const verdict = verifyHoloCpuPhysicsReceipt(tampered, {
      expectedSource: villageSource,
      expectedRunSeed: executionOptions.runSeed,
      expectedSteps: executionOptions.steps,
    });
    expect(verdict.valid).toBe(false);
    expect(verdict.observer).toBeUndefined();
    expect(verdict.errors.join(' ')).toContain('replay differs');
  });

  it('fails dark on non-finite receipt values, the wrong source, and unsupported shapes', () => {
    const receipt = executeHoloCpuPhysicsReceipt(villageSource, executionOptions);
    const nonFinite = clone(receipt);
    nonFinite.observer.frames[1].bodies[0].transform.position[0] = Number.POSITIVE_INFINITY;
    const nonFiniteVerdict = verifyHoloCpuPhysicsReceipt(nonFinite, {
      expectedSource: villageSource,
      expectedRunSeed: executionOptions.runSeed,
      expectedSteps: executionOptions.steps,
    });
    expect(nonFiniteVerdict.valid).toBe(false);
    expect(nonFiniteVerdict.observer).toBeUndefined();

    const wrongSource = villageSource.replace(
      'position: [-1.8, 0.55, 1.2]',
      'position: [-2.1, 0.55, 1.2]'
    );
    const wrongSourceVerdict = verifyHoloCpuPhysicsReceipt(receipt, {
      expectedSource: wrongSource,
      expectedRunSeed: executionOptions.runSeed,
      expectedSteps: executionOptions.steps,
    });
    expect(wrongSourceVerdict.valid).toBe(false);
    expect(wrongSourceVerdict.observer).toBeUndefined();

    expect(() =>
      executeHoloCpuPhysicsReceipt(
        `
          composition "UnsupportedPhysicsShape" {
            object "bad-shape" @collidable {
              geometry: "torus"
              scale: [1, 1, 1]
              @physics { mass: 1 }
            }
          }
        `,
        { runSeed: 'unsupported-shape', steps: 1 }
      )
    ).toThrow(/not admitted/);

    const cylinderReceipt = executeHoloCpuPhysicsReceipt(
      `
        composition "NativeCylinder" {
          object "cylinder" @collidable {
            geometry: "cylinder"
            radius: 2
            height: 1
            @physics { mass: 0 static: true }
          }
        }
      `,
      { runSeed: 'native-cylinder', steps: 1 }
    );
    expect(cylinderReceipt.registration.bodies[0].shape).toEqual({
      type: 'cylinder',
      radius: 2,
      height: 1,
      axis: 'y',
    });
    expect(cylinderReceipt.claimBoundary.cylinderCollisionClaimed).toBe(true);

    expect(() =>
      executeHoloCpuPhysicsReceipt(
        `
          composition "EllipticCylinder" {
            object "elliptic-cylinder" @collidable {
              geometry: "cylinder"
              scale: [4, 1, 2]
              @physics { mass: 0 static: true }
            }
          }
        `,
        { runSeed: 'elliptic-cylinder', steps: 1 }
      )
    ).toThrow(/requires equal X and Z radii/);

    expect(() =>
      executeHoloCpuPhysicsReceipt(
        `
          composition "UnsupportedGravity" {
            object "custom-gravity" @collidable {
              geometry: "box"
              gravity: 0.5
              @physics { mass: 1 }
            }
          }
        `,
        { runSeed: 'unsupported-gravity', steps: 1 }
      )
    ).toThrow(/gravity.*not supported/);

    expect(() =>
      executeHoloCpuPhysicsReceipt(
        `
          composition "ReservedPhysicsId" {
            object "bad|id" @collidable {
              geometry: "box"
              scale: [1, 1, 1]
              @physics { mass: 1 }
            }
          }
        `,
        { runSeed: 'reserved-id', steps: 1 }
      )
    ).toThrow(/reserved/);
  });

  it('rejects accessor options, oversized ids, and contact floods before sealing', () => {
    let getterReads = 0;
    const accessorOptions = {};
    Object.defineProperties(accessorOptions, {
      runSeed: {
        enumerable: true,
        get() {
          getterReads += 1;
          return 'hostile-options';
        },
      },
      steps: {
        enumerable: true,
        value: 1,
      },
    });
    expect(() => executeHoloCpuPhysicsReceipt(villageSource, accessorOptions as never)).toThrow(
      /data property/
    );
    expect(getterReads).toBe(0);

    const oversizedId = 'x'.repeat(257);
    expect(() =>
      executeHoloCpuPhysicsReceipt(
        `composition "OversizedId" {
          object "${oversizedId}" @collidable {
            geometry: "box"
            @physics { mass: 1 }
          }
        }`,
        { runSeed: 'oversized-id', steps: 1 }
      )
    ).toThrow(/id exceeds 256 bytes/);

    const overlappingBodies = Array.from(
      { length: 92 },
      (_, index) => `
        object "overlap-${index}" @collidable {
          geometry: "sphere"
          @physics { mass: 0 kinematic: true }
        }
      `
    ).join('\n');
    expect(() =>
      executeHoloCpuPhysicsReceipt(`composition "ContactFlood" { ${overlappingBodies} }`, {
        runSeed: 'contact-flood',
        steps: 1,
      })
    ).toThrow(/contact events in frame 1 exceed 4096/);
  });

  it('snapshots verifier inputs and fails dark on sparse or accessor-backed receipts', () => {
    const tinySource = `
      composition "VerifierHardening" {
        object "body" @collidable {
          geometry: "box"
          @physics { mass: 0 static: true }
        }
      }
    `;
    const tinyReceipt = executeHoloCpuPhysicsReceipt(tinySource, {
      runSeed: 'verifier-hardening',
      steps: 1,
    });
    let optionGetterReads = 0;
    const accessorVerificationOptions = {
      expectedSource: tinySource,
      expectedRunSeed: 'verifier-hardening',
    };
    Object.defineProperty(accessorVerificationOptions, 'expectedSteps', {
      enumerable: true,
      get() {
        optionGetterReads += 1;
        return 1;
      },
    });
    const accessorOptionsVerdict = verifyHoloCpuPhysicsReceipt(
      tinyReceipt,
      accessorVerificationOptions as never
    );
    expect(accessorOptionsVerdict.valid).toBe(false);
    expect(accessorOptionsVerdict.observer).toBeUndefined();
    expect(optionGetterReads).toBe(0);

    const sparse = clone(tinyReceipt);
    sparse.observer.frames = new Array(100_001);
    const sparseVerdict = verifyHoloCpuPhysicsReceipt(sparse, {
      expectedSource: tinySource,
      expectedRunSeed: 'verifier-hardening',
      expectedSteps: 1,
    });
    expect(sparseVerdict.valid).toBe(false);
    expect(sparseVerdict.observer).toBeUndefined();
    expect(sparseVerdict.errors.join(' ')).toMatch(/array length|dense standard array/);

    const accessorReceipt = clone(tinyReceipt);
    let receiptGetterReads = 0;
    Object.defineProperty(accessorReceipt, 'schema', {
      enumerable: true,
      get() {
        receiptGetterReads += 1;
        return HOLO_CPU_PHYSICS_RECEIPT_SCHEMA;
      },
    });
    const accessorReceiptVerdict = verifyHoloCpuPhysicsReceipt(accessorReceipt, {
      expectedSource: tinySource,
      expectedRunSeed: 'verifier-hardening',
      expectedSteps: 1,
    });
    expect(accessorReceiptVerdict.valid).toBe(false);
    expect(accessorReceiptVerdict.observer).toBeUndefined();
    expect(receiptGetterReads).toBe(0);
  });

  it('aborts if mutable engine defaults drift during execution', () => {
    const originalStep = PhysicsWorldImpl.prototype.step;
    const originalThreshold = PHYSICS_DEFAULTS.sleepThreshold;
    const stepSpy = vi.spyOn(PhysicsWorldImpl.prototype, 'step').mockImplementation(function (
      this: PhysicsWorldImpl,
      deltaTime: number
    ) {
      PHYSICS_DEFAULTS.sleepThreshold = originalThreshold + 0.001;
      return originalStep.call(this, deltaTime);
    });
    try {
      expect(() =>
        executeHoloCpuPhysicsReceipt(
          `
            composition "DefaultsDrift" {
              object "body" @collidable {
                geometry: "box"
                @physics { mass: 0 static: true }
              }
            }
          `,
          { runSeed: 'defaults-drift', steps: 1 }
        )
      ).toThrow(/defaults changed after step 1/);
    } finally {
      PHYSICS_DEFAULTS.sleepThreshold = originalThreshold;
      stepSpy.mockRestore();
    }
  });

  it('keeps the canonical static projection declaration-only and unchanged', () => {
    const projection = executeHoloWorldProjection(villageSource);
    const before = canonicalizeHeadlessValue(projection);
    const receipt = executeHoloCpuPhysicsReceipt(villageSource, executionOptions);

    expect(canonicalizeHeadlessValue(projection)).toBe(before);
    expect(projection.posePhysics).toMatchObject({
      complete: false,
      physicsExecutionClaimed: false,
    });
    expect(receipt.claimBoundary.canonicalExperimentMutated).toBe(false);
  });
});
