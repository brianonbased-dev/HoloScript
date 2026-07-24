import { readFileSync } from 'node:fs';
import {
  compileN4ResidualWorldSource,
  generateN4Scene,
  proposeN4TypedMove,
  trainN4Models,
} from '@holoscript/core/world-model';
import { UAALVirtualMachine } from '@holoscript/uaal';
import { describe, expect, it } from 'vitest';
import { ComponentType } from '../../vm/opcodes';
import { HoloVM, type TransformComponent } from '../../vm/executor';
import { executeN4TypedMoveRoundTrip } from '../bridge';

const SOURCE_PATH = new URL(
  '../../../../core/src/world-model/n4_residual_world_loop.hsplus',
  import.meta.url
);

function setup() {
  const contract = compileN4ResidualWorldSource(readFileSync(SOURCE_PATH, 'utf8'));
  const models = trainN4Models(
    Array.from({ length: 64 }, (_, index) => generateN4Scene(4100 + index, 'train'))
  );
  const scene = generateN4Scene(9100, 'ood');
  const action = proposeN4TypedMove(contract, models, scene, 'object-0', { x: 1, y: 0 });
  const holoVM = new HoloVM();
  const entityId = holoVM.world.spawn('object-0');
  holoVM.world.setComponent(entityId, ComponentType.Transform, {
    position: [scene.objects[0]!.position.x, scene.objects[0]!.position.y, 0],
    rotation: [0, 0, 0, 1],
    scale: [1, 1, 1],
  } satisfies TransformComponent);
  return { contract, models, scene, action, holoVM, entityId };
}

describe('N4 uAAL -> HoloVM owned-runtime round trip', () => {
  it('replays a typed action through uAAL and mutates HoloVM ECS state', async () => {
    const { contract, models, action, holoVM, entityId } = setup();
    const uaal = new UAALVirtualMachine({ recordLog: true });
    const receipt = await executeN4TypedMoveRoundTrip(holoVM, uaal, action, {
      sourceDigest: contract.sourceDigest,
      graphDigest: contract.learningGraph.deterministicDigest,
      modelDigest: models.typedResidual.deterministicDigest,
    });
    const transform = holoVM.world.getComponent<TransformComponent>(
      entityId,
      ComponentType.Transform
    );
    const replay = await UAALVirtualMachine.replayLog(receipt.uaalProgram, receipt.uaalLog);

    expect(receipt.mutationApplied).toBe(true);
    expect(receipt.uaalTaskStatus).toBe('HALTED');
    expect(receipt.uaalLog.steps.map((step) => step.opcodeName)).toEqual([
      'PUSH',
      'EXECUTE',
      'HALT',
    ]);
    expect(replay.valid).toBe(true);
    expect(transform?.position[0]).toBe(action.position.x);
    expect(transform?.position[1]).toBe(action.position.y);
  });

  it('rejects stale source custody before any HoloVM mutation', async () => {
    const { contract, models, action, holoVM, entityId } = setup();
    const before = holoVM.world.getComponent<TransformComponent>(
      entityId,
      ComponentType.Transform
    )!.position;

    await expect(
      executeN4TypedMoveRoundTrip(
        holoVM,
        new UAALVirtualMachine({ recordLog: true }),
        { ...action, sourceDigest: 'sha256:stale' },
        {
          sourceDigest: contract.sourceDigest,
          graphDigest: contract.learningGraph.deterministicDigest,
          modelDigest: models.typedResidual.deterministicDigest,
        }
      )
    ).rejects.toThrow(/custody digest mismatch/);
    expect(
      holoVM.world.getComponent<TransformComponent>(entityId, ComponentType.Transform)!.position
    ).toEqual(before);
  });

  it('rejects an undeclared learned residual target before any HoloVM mutation', async () => {
    const { contract, models, action, holoVM, entityId } = setup();
    const before = holoVM.world.getComponent<TransformComponent>(
      entityId,
      ComponentType.Transform
    )!.position;

    await expect(
      executeN4TypedMoveRoundTrip(
        holoVM,
        new UAALVirtualMachine({ recordLog: true }),
        {
          ...action,
          residualScope: [...action.residualScope, 'host.process'] as typeof action.residualScope,
        },
        {
          sourceDigest: contract.sourceDigest,
          graphDigest: contract.learningGraph.deterministicDigest,
          modelDigest: models.typedResidual.deterministicDigest,
        }
      )
    ).rejects.toThrow(/undeclared or reordered residual scope/);
    expect(
      holoVM.world.getComponent<TransformComponent>(entityId, ComponentType.Transform)!.position
    ).toEqual(before);
  });
});
