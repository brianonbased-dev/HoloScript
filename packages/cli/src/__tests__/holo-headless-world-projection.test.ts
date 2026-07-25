import { readFileSync } from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { canonicalizeHeadlessValue } from '@holoscript/engine/runtime';
import { describe, expect, it } from 'vitest';
import {
  DETERMINISTIC_HOLO_WORLD_PROJECTION,
  HOLO_WORLD_PROJECTION_PROVENANCE_SCHEMA,
  executeHoloWorldProjection,
  verifyHoloWorldProjectionProvenance,
} from '../holo-headless-world-projection';

const testDir = path.dirname(fileURLToPath(import.meta.url));
const villageSource = readFileSync(
  path.join(testDir, 'fixtures/model-village/village.holo'),
  'utf8'
);

function clone<T>(value: T): T {
  return JSON.parse(canonicalizeHeadlessValue(value)) as T;
}

describe('deterministic .holo headless world projection', () => {
  it('reprojects the durable Model Village fixture byte-for-byte', () => {
    const first = executeHoloWorldProjection(villageSource);
    const second = executeHoloWorldProjection(villageSource);

    expect(canonicalizeHeadlessValue(second)).toBe(canonicalizeHeadlessValue(first));
    expect(first.provenance).toMatchObject({
      schema: HOLO_WORLD_PROJECTION_PROVENANCE_SCHEMA,
      engine: DETERMINISTIC_HOLO_WORLD_PROJECTION,
      hashAlgorithm: 'sha256-strict-canonical-json-v1',
      parser: {
        implementation: '@holoscript/core/HoloCompositionParser.parse',
        options: {
          locations: true,
          tolerant: false,
          strict: false,
        },
      },
      result: {
        objectCount: 6,
      },
    });
    expect(first.provenance.sourceHash).toBe(
      '70253bbd6ee5bccca66632ece66b1cef7bab5b5cc51c80f3c3b7f4fe6a3ec93b'
    );
    expect(first.provenance.result.sceneHash).toBe(
      '9727919e11c4c27ad805b942c77e3ead896532ba686bcf50ff751ec900048b0c'
    );
    expect(first.provenance.result.posePhysicsHash).toBe(
      '676e7183ab22a70278452e852cd512996fba12868c8e27bcd49f25385bf229fa'
    );
    expect(first.provenance.provenanceCommitment).toBe(
      'a8a36f66dce83e5a06125244d6a8ebd2abe279364d92077da6996526f399adda'
    );
    expect(
      (first.scene.objects as Array<{ id: string }>).map((object) => object.id)
    ).toEqual([
      'commons',
      'cistern',
      'resident-1',
      'resident-2',
      'external-valve',
      'commons-lantern',
    ]);
    expect(
      verifyHoloWorldProjectionProvenance(first.provenance, {
        expectedSource: villageSource,
        expectedScene: first.scene,
        expectedPosePhysics: first.posePhysics,
      })
    ).toEqual({ valid: true, errors: [] });
  });

  it('separates source identity from semantic projection output', () => {
    const original = executeHoloWorldProjection(villageSource);
    const whitespaceOnly = executeHoloWorldProjection(`${villageSource}\n`);
    const movedResident = executeHoloWorldProjection(
      villageSource.replace(
        'position: [-1.8, 0.55, 1.2]',
        'position: [-2.1, 0.55, 1.2]'
      )
    );

    expect(whitespaceOnly.provenance.sourceHash).not.toBe(original.provenance.sourceHash);
    expect(whitespaceOnly.provenance.result).toEqual(original.provenance.result);
    expect(movedResident.provenance.result.sceneHash).not.toBe(
      original.provenance.result.sceneHash
    );
    expect(movedResident.provenance.result.posePhysicsHash).not.toBe(
      original.provenance.result.posePhysicsHash
    );
  });

  it('fails closed on parser diagnostics, imports, extra fields, and mismatched output', () => {
    expect(() =>
      executeHoloWorldProjection('composition "Broken" { object "unfinished" {')
    ).toThrow(/parser reported errors/i);
    expect(() =>
      executeHoloWorldProjection(`composition "Imported" {
        import { Shared } from "./shared.holo"
        object "local" {}
      }`)
    ).toThrow(/imports are not admitted/i);

    const projection = executeHoloWorldProjection(villageSource);
    const shadowProvenance = {
      ...clone(projection.provenance),
      publisherAuthenticated: true,
    };
    expect(
      verifyHoloWorldProjectionProvenance(shadowProvenance, {
        expectedSource: villageSource,
        expectedScene: projection.scene,
        expectedPosePhysics: projection.posePhysics,
      })
    ).toMatchObject({
      valid: false,
      errors: [expect.stringMatching(/fields do not match/i)],
    });

    const mismatchedScene = clone(projection.scene);
    (mismatchedScene.objects as Array<{ id: string }>)[0].id = 'forged-commons';
    expect(
      verifyHoloWorldProjectionProvenance(projection.provenance, {
        expectedSource: villageSource,
        expectedScene: mismatchedScene,
        expectedPosePhysics: projection.posePhysics,
      })
    ).toMatchObject({
      valid: false,
      errors: [expect.stringMatching(/source-backed scene projection differs/i)],
    });
  });
});
