import { describe, expect, it } from 'vitest';
import {
  ARTIFACT_RECEIPT_TYPES,
  attachTaskArtifacts,
  auditDoneLog,
  cloneArtifactReceipt,
  completeTask,
  addTasksToBoard,
  validateArtifactReceipt,
  type ArtifactReceipt,
  type DoneLogEntry,
  type TeamTask,
} from '../board';

function makeTask(overrides: Partial<TeamTask> = {}): TeamTask {
  return {
    id: 'task_artifacts',
    title: 'Produce artifact receipts',
    description: 'Attach output evidence.',
    status: 'open',
    priority: 7,
    createdAt: '2026-05-06T00:00:00Z',
    ...overrides,
  };
}

function makeArtifact(overrides: Partial<ArtifactReceipt> = {}): ArtifactReceipt {
  return {
    id: 'artifact_docs',
    type: 'docs',
    path: 'docs/output.md',
    hash: 'a'.repeat(64),
    hashAlgorithm: 'sha256',
    producer: 'codex-hardware',
    validator: 'vitest',
    provenance: { taskId: 'task_artifacts', commitHash: 'abc1234' },
    verificationCommands: [
      {
        id: 'docs-test',
        command: 'node validate-docs.mjs docs/output.md',
        status: 'passed',
        artifactIds: ['artifact_docs'],
        exitCode: 0,
      },
    ],
    ...overrides,
  };
}

describe('board artifact receipts', () => {
  it('supports the expected managed-agent artifact families', () => {
    const fixtures: ArtifactReceipt[] = [
      makeArtifact({ id: 'docs', type: 'docs', path: 'docs/spec.md' }),
      makeArtifact({ id: 'pptx', type: 'pptx', path: 'deck/out.pptx' }),
      makeArtifact({ id: 'screenshot', type: 'screenshot', path: 'artifacts/screen.png' }),
      makeArtifact({ id: 'trace', type: 'cael-trace', path: 'traces/run.cael.jsonl' }),
      makeArtifact({ id: 'bench', type: 'benchmark-jsonl', path: 'bench/run.jsonl' }),
      makeArtifact({ id: 'patch', type: 'code-patch', path: 'patches/change.diff' }),
    ];

    expect(ARTIFACT_RECEIPT_TYPES).toContain('benchmark-jsonl');
    for (const artifact of fixtures) {
      expect(validateArtifactReceipt(artifact)).toEqual([]);
    }
  });

  it('requires path or uri, hash, producer, and verification command text', () => {
    const invalid = makeArtifact({
      path: undefined,
      uri: undefined,
      hash: '',
      producer: '',
      verificationCommands: [{ command: '' }],
    });

    expect(validateArtifactReceipt(invalid)).toEqual([
      'ArtifactReceipt.path or ArtifactReceipt.uri is required.',
      'ArtifactReceipt.hash is required.',
      'ArtifactReceipt.producer is required.',
      'ArtifactReceipt artifact_docs has a verification command without command text.',
    ]);
  });

  it('attaches artifact receipts to live board tasks', () => {
    const board = [makeTask()];
    const result = attachTaskArtifacts(board, 'task_artifacts', [makeArtifact()]);

    expect(result.success).toBe(true);
    expect(result.task?.artifacts).toHaveLength(1);
    expect(result.task?.artifacts?.[0].verificationCommands?.[0].artifactIds).toEqual([
      'artifact_docs',
    ]);
  });

  it('rejects malformed receipts during batch board task creation', () => {
    const { added, skipped } = addTasksToBoard([], [], [
      makeTask({
        title: 'Create invalid artifact receipt',
        artifacts: [makeArtifact({ hash: '' })],
      }),
    ]);

    expect(added).toHaveLength(0);
    expect(skipped).toEqual([
      { title: 'Create invalid artifact receipt', reason: 'invalid_artifact' },
    ]);
  });

  it('surfaces artifact receipts in the done log when a task completes', () => {
    const artifact = makeArtifact({
      renderOutput: { label: 'render', path: 'renders/output.png', hash: 'b'.repeat(64) },
      testOutput: { label: 'test', path: 'test-output.txt', hash: 'c'.repeat(64) },
    });
    const board = [makeTask({ artifacts: [artifact] })];

    const { result, updatedBoard } = completeTask(board, 'task_artifacts', 'codex-hardware', {
      commit: 'abc1234',
      summary: 'Attached artifact receipts.',
    });

    expect(result.success).toBe(true);
    expect(updatedBoard).toHaveLength(0);
    expect(result.doneEntry?.artifacts).toHaveLength(1);
    expect(result.doneEntry?.artifacts?.[0]).toMatchObject({
      id: 'artifact_docs',
      type: 'docs',
      renderOutput: { path: 'renders/output.png' },
      testOutput: { path: 'test-output.txt' },
    });
  });

  it('counts artifact receipts in done-log audit results', () => {
    const entries: DoneLogEntry[] = [
      {
        taskId: 'task_artifacts',
        title: 'Produce artifact receipts',
        completedBy: 'codex-hardware',
        commitHash: 'abc1234',
        timestamp: '2026-05-06T00:00:00Z',
        summary: 'Done.',
        artifacts: [
          makeArtifact(),
          cloneArtifactReceipt(makeArtifact({ id: 'artifact_patch', type: 'code-patch' })),
        ],
      },
    ];

    const result = auditDoneLog(entries);
    expect(result.artifactReceipts).toBe(2);
    expect(result.verified).toBe(1);
  });
});
