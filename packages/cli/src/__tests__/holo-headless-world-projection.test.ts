import { readFileSync } from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { canonicalizeHeadlessValue } from '@holoscript/engine/runtime';
import { describe, expect, it } from 'vitest';
import {
  DETERMINISTIC_HOLO_WORLD_PROJECTION,
  HOLO_WORLD_PROJECTION_COVERAGE,
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
      coverage: HOLO_WORLD_PROJECTION_COVERAGE,
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
      'cbad315946d342ba8460223bc7be80bea4a3ea673044e995c95c13fe565865b8'
    );
    expect(first.provenance.result.sceneHash).toBe(
      '561d414988f3dce4dde399c30ab9e72a46d9d80bdfbde7954c0eed7f03a8e68c'
    );
    expect(first.provenance.result.posePhysicsHash).toBe(
      'e2cdadc5d52dfb7c4c4327b2b2a8e230690457fed601a0e90f0064fa20c73d6e'
    );
    expect(first.provenance.provenanceCommitment).toBe(
      'e0c965a93d48b62d1187b6547f1b9f36d6a2039e189de492bedfc2cf435fb0ab'
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
    const bodies = first.posePhysics.bodies as Array<{
      id: string;
      transform: { scale: number[] };
      physics: {
        massKg: number | null;
        friction: number | null;
        geometry: string | null;
      };
    }>;
    expect(first.posePhysics).toMatchObject({
      coverage: HOLO_WORLD_PROJECTION_COVERAGE,
      complete: false,
      physicsExecutionClaimed: false,
    });
    expect(bodies.find((body) => body.id === 'commons')).toMatchObject({
      transform: { scale: [12, 0.3, 12] },
      physics: { massKg: 0, geometry: 'box' },
    });
    expect(bodies.find((body) => body.id === 'cistern')).toMatchObject({
      transform: { scale: [2.2, 1.8, 2.2] },
      physics: { massKg: 450 },
    });
    expect(bodies.find((body) => body.id === 'resident-1')).toMatchObject({
      physics: { massKg: 75, friction: 0.55 },
    });
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

  it('faithfully normalizes admitted static physics and geometry aliases', () => {
    const projection = executeHoloWorldProjection(`composition "Aliases" {
      template "AliasTemplate" {
        shape: sphere
        mass_kg: 11
        @physics {
          mass_kg: 11
          shape: sphere
        }
      }
      object "body" {
        shape: cylinder
        radius: 2
        height: 3
        physics: {
          mass_kg: 10
          collidable: true
          kinematic: true
          friction: 0.4
          restitution: 0.1
        }
      }
      object "boxy" {
        geometry: box
        width: 2
        height: 3
        depth: 4
      }
      object "plane" {
        geometry: plane
        width: 2
        height: 3
      }
      object "cone" {
        geometry: Cone
        radius: 1
        height: 3
      }
      object "static-body" {
        geometry: sphere
        @physics {
          static: true
          kinematic: false
          mass: 0
        }
      }
      object "collider-conflict" {
        geometry: cone
        position: { x: 1, y: 2, z: 3 }
        quaternion: [0, 0, 0, 1]
        @physics {
          geometry: sphere
          shape: box
        }
      }
      object "layered-alias" using "AliasTemplate" {
        geometry: box
        mass: 21
        scale: 2
        @physics {
          mass: 21
          geometry: box
        }
      }
    }`);
    const objects = projection.scene.objects as Array<{
      id: string;
      properties: { geometry: string };
      transform: { scale: number[] };
      physics: {
        geometry: string;
        collidable: boolean;
        massKg: number;
        kinematic: boolean;
        friction: number;
        restitution: number;
      };
    }>;
    const body = objects.find((object) => object.id === 'body');
    const boxy = objects.find((object) => object.id === 'boxy');
    const plane = objects.find((object) => object.id === 'plane');
    const cone = objects.find((object) => object.id === 'cone');
    const staticBody = objects.find((object) => object.id === 'static-body');
    const colliderConflict = objects.find(
      (object) => object.id === 'collider-conflict'
    );
    const layeredAlias = objects.find(
      (object) => object.id === 'layered-alias'
    );

    expect(body).toMatchObject({
      transform: { scale: [4, 3, 4] },
      physics: {
        geometry: 'cylinder',
        collidable: true,
        massKg: 10,
        kinematic: true,
        friction: 0.4,
        restitution: 0.1,
      },
    });
    expect(boxy).toMatchObject({
      transform: { scale: [2, 3, 4] },
      physics: { geometry: 'box' },
    });
    expect(plane).toMatchObject({
      transform: { scale: [2, 3, 1] },
      physics: { geometry: 'plane' },
    });
    expect(cone).toMatchObject({
      transform: { scale: [2, 3, 2] },
      physics: { geometry: 'cone' },
    });
    expect(staticBody).toMatchObject({
      physics: { massKg: 0, kinematic: true },
    });
    expect(colliderConflict).toMatchObject({
      properties: { geometry: 'cone' },
      transform: {
        position: { x: 1, y: 2, z: 3 },
        quaternion: [0, 0, 0, 1],
      },
      physics: { geometry: 'box' },
    });
    expect(layeredAlias).toMatchObject({
      properties: { geometry: 'box', massKg: 21 },
      transform: { scale: [2, 2, 2] },
      physics: { geometry: 'box', massKg: 21 },
      traitConfigs: {
        physics: {
          geometry: 'box',
          mass: 21,
          mass_kg: 11,
          massKg: 21,
          shape: 'box',
        },
      },
    });
  });

  it('field-merges template and object trait configs', () => {
    const projection = executeHoloWorldProjection(`composition "TraitMerge" {
      template "Body" {
        geometry: sphere
        @physics {
          mass: 10
          friction: 0.5
          restitution: 0.2
          linear_damping: 0.4
        }
      }
      object "body" using "Body" {
        @physics { kinematic: true }
        @emissive {
          emission_color: red
          emission_intensity: 3
        }
      }
    }`);
    const body = (projection.scene.objects as Array<{
      traitConfigs: {
        physics: Record<string, unknown>;
        emissive: Record<string, unknown>;
      };
      physics: {
        massKg: number;
        kinematic: boolean;
        friction: number;
        restitution: number;
      };
    }>)[0];

    expect(body.physics).toMatchObject({
      massKg: 10,
      kinematic: true,
      friction: 0.5,
      restitution: 0.2,
    });
    expect(body.traitConfigs).toEqual({
      emissive: {
        emission_color: 'red',
        emission_intensity: 3,
      },
      physics: {
        friction: 0.5,
        kinematic: true,
        linear_damping: 0.4,
        mass: 10,
        massKg: 10,
        restitution: 0.2,
      },
    });
  });

  it('fails closed on parser diagnostics, imports, extra fields, and mismatched output', () => {
    expect(() =>
      executeHoloWorldProjection('composition "Broken" { object "unfinished" {')
    ).toThrow(/parser reported errors|expected RBRACE|received EOF/i);
    expect(() =>
      executeHoloWorldProjection(`composition "Imported" {
        import { Shared } from "./shared.holo"
        object "local" {}
      }`)
    ).toThrow(/imports are not admitted|source token IMPORT|root token IMPORT/i);
    expect(() =>
      executeHoloWorldProjection(`composition "Conditional" {
        if true { object "then" {} } else { object "else" {} }
      }`)
    ).toThrow(/source token IF.*outside/i);
    expect(() =>
      executeHoloWorldProjection(`composition "Iterator" {
        for item in [1, 2, 3] { object "iterated" {} }
      }`)
    ).toThrow(/source token FOR.*outside/i);
    expect(() =>
      executeHoloWorldProjection(`composition "LightOnly" {
        point_light "sun" { intensity: 5 }
      }`)
    ).toThrow(/root token IDENTIFIER.*point_light/i);
    for (const lifecycleBody of [
      'logic { action decide() { return true } }',
      'behavior { on_tick: true }',
      'animation { clip: "idle" }',
      'timeline { duration: 1 }',
      'script { run: true }',
      'on_update { enabled: true }',
      'onTick { enabled: true }',
      'state_machine { initial: "idle" }',
      'stateMachine { initial: "idle" }',
      'StAtE_MaChInE { initial: "idle" }',
      'transition { from: "idle", to: "active" }',
      'timer { interval: 1 }',
      '` state_machine { initial: "idle" } `',
      'type: "logic"',
      'Type: "eventhandler"',
    ]) {
      expect(() =>
        executeHoloWorldProjection(`composition "Lifecycle" {
          object "resident" { ${lifecycleBody} }
        }`)
      ).toThrow(
        /lifecycle|behavior declaration|source token|unknown character|static property profile/i
      );
    }
    expect(() =>
      executeHoloWorldProjection(`composition "LifecycleTrait" {
        object "resident" @animated { geometry: "sphere" }
      }`)
    ).toThrow(/lifecycle trait|source token/i);
    expect(() =>
      executeHoloWorldProjection(`composition "TemplateLifecycleTrait" {
        template "Resident" {
          geometry: "sphere"
          @behavior_tree
        }
        object "resident" using "Resident" {}
      }`)
    ).toThrow(/lifecycle trait|source token/i);
    expect(() =>
      executeHoloWorldProjection(`composition "NestedTraitLifecycle" {
        object "resident" @physics {
          geometry: "sphere"
          @physics { mass: 1, on_update: true }
        }
      }`)
    ).toThrow(/lifecycle property|source token/i);
    for (const nonStaticBody of [
      'return true',
      'switch value { default: {} }',
      'counter++',
      'counter += 1',
      'value: 1 + 2',
      'value: 2 - 1',
      'value: a && b',
      'bind target',
      'migrate "v2"',
      'connect source',
    ]) {
      expect(() =>
        executeHoloWorldProjection(`composition "NonStaticToken" {
          object "resident" { ${nonStaticBody} }
        }`)
      ).toThrow(/source token|static property profile/i);
    }
    expect(() =>
      executeHoloWorldProjection(`composition "StaticWordsInText" {
        // state_machine and @animated in comments are not syntax.
        object "resident" {
          description: "behavior timeline on_update"
        }
      }`)
    ).not.toThrow();
    expect(() =>
      executeHoloWorldProjection(`composition Accepted {
        object inside { geometry: sphere }
      }
      object dropped { geometry: box }`)
    ).toThrow(/end of source expected EOF/i);
    expect(() =>
      executeHoloWorldProjection(`composition Accepted {
        using foo
        object resident { geometry: sphere }
      }`)
    ).toThrow(/root token USING/i);
    expect(() =>
      executeHoloWorldProjection(`composition Accepted {
        networked { sync: true }
        object resident { geometry: sphere }
      }`)
    ).toThrow(/root token IDENTIFIER/i);
    expect(() =>
      executeHoloWorldProjection(`composition Accepted {
        spatial_group village {
          @physics { mass: 8 }
          object resident { geometry: sphere }
        }
      }`)
    ).toThrow(/spatial group village cannot contain AT/i);
    expect(() =>
      executeHoloWorldProjection(`composition Accepted {
        spatial_group village {
          template Hidden { geometry: sphere }
          object resident { geometry: sphere }
        }
      }`)
    ).toThrow(/spatial group village cannot contain TEMPLATE/i);
    expect(() =>
      executeHoloWorldProjection(`composition Accepted {
        object resident { geometry: sphere }
        $
      }`)
    ).toThrow(/unknown character/i);
    expect(() =>
      executeHoloWorldProjection(`composition Accepted {
        object resident @Physics { Geometry: sphere }
      }`)
    ).toThrow(/static trait profile|static property profile/i);
    expect(() =>
      executeHoloWorldProjection(`composition Accepted {
        object resident {
          geometry: sphere
          physics: {
            mass: heavy
            kinematic: false_text
            collidable: false_text
            friction: [1, 2]
          }
        }
      }`)
    ).toThrow(/must be a boolean|must be a finite number/i);
    for (const invalidPhysics of ['true', '[]', 'null']) {
      expect(() =>
        executeHoloWorldProjection(`composition Accepted {
          object resident {
            geometry: sphere
            physics: ${invalidPhysics}
          }
        }`)
      ).toThrow(/physics must be an object/i);
    }
    for (const invalidTransform of [
      'geometry: box width: 2 height: tall depth: 4',
      'geometry: cylinder radius: 2 height: tall',
      'geometry: sphere position: true',
      'geometry: sphere position: [1, 2]',
      'geometry: sphere scale: [1, 2, tall]',
      'geometry: sphere quaternion: [0, 0, 1]',
    ]) {
      expect(() =>
        executeHoloWorldProjection(`composition Accepted {
          object resident { ${invalidTransform} }
        }`)
      ).toThrow(/must be a finite number|must be a finite [34]-component vector/i);
    }
    expect(() =>
      executeHoloWorldProjection(
        'composition\u00a0Accepted { object resident { geometry: sphere } }'
      )
    ).toThrow(/unknown character/i);
    expect(() =>
      executeHoloWorldProjection(`composition "DuplicateProperty" {
        object "same" {
          geometry: sphere
          geometry: box
        }
      }`)
    ).toThrow(/repeats static property geometry/i);
    expect(() =>
      executeHoloWorldProjection(`composition "DuplicateTrait" {
        object "same" {
          @physics { mass: 1 }
          @physics { mass: 2 }
        }
      }`)
    ).toThrow(/repeats static trait physics/i);
    expect(() =>
      executeHoloWorldProjection(`composition "DuplicateMarkerTrait" {
        object "same" @static {
          @static
        }
      }`)
    ).toThrow(/repeats static trait static/i);
    expect(() =>
      executeHoloWorldProjection(`composition "Duplicate" {
        object "same" {}
        object "same" {}
      }`)
    ).toThrow(/duplicate object id same/i);
    expect(() =>
      executeHoloWorldProjection(`composition "ReservedRoot" {
        object "root" {
          object "child" { geometry: sphere }
        }
      }`)
    ).toThrow(/duplicate object id root/i);

    const tooDeepWorld = `composition "TooDeep" {
      ${Array.from({ length: 65 }, (_, index) => `object "n${index}" {`).join('\n')}
      geometry: sphere
      ${'}'.repeat(65)}
    }`;
    expect(() => executeHoloWorldProjection(tooDeepWorld)).toThrow(
      /object nesting exceeds 64/i
    );
    const tooManyObjects = `composition "TooMany" {
      ${Array.from({ length: 2_049 }, (_, index) => `object "n${index}" {}`).join('\n')}
    }`;
    expect(() => executeHoloWorldProjection(tooManyObjects)).toThrow(
      /object count exceeds 2048/i
    );
    const tooDeepValue = `${'['.repeat(33)}0${']'.repeat(33)}`;
    expect(() =>
      executeHoloWorldProjection(`composition "TooDeepValue" {
        object "value" { scale: ${tooDeepValue} }
      }`)
    ).toThrow(/value nesting exceeds 32/i);

    const projection = executeHoloWorldProjection(villageSource);
    const oversizedHash = {
      ...clone(projection.provenance),
      sourceHash: 'x'.repeat(5_000),
    };
    expect(
      verifyHoloWorldProjectionProvenance(oversizedHash, {
        expectedSource: villageSource,
      })
    ).toMatchObject({
      valid: false,
      errors: [expect.stringMatching(/sourceHash must be a lowercase SHA-256 digest/i)],
    });
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
