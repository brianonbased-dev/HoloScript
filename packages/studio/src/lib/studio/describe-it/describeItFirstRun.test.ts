import { describe, expect, it } from 'vitest';
import { parseHolo } from '../../../../../core/src/parser/HoloCompositionParser';

import {
  DESCRIBE_IT_EXAMPLES,
  buildDescribeItPlan,
  buildDescribeItPreview,
  buildDescribeItReceipt,
  buildDescribeItSmokeResult,
  validateDescribeItReceipt,
} from './describeItFirstRun';

describe('Describe-It first-run helpers', () => {
  it('ships the five required first-run example prompts', () => {
    expect(DESCRIBE_IT_EXAMPLES.map((example) => example.id)).toEqual([
      'spatial-app',
      'iot-device',
      'digital-twin',
      'agent-team',
      'robotics-scene',
    ]);
  });

  it('builds an editable plan and parseable generated .holo preview target', () => {
    const plan = buildDescribeItPlan({
      prompt: 'A robotics cell with ROS2 telemetry and a safety gate.',
    });
    const generated = buildDescribeItPreview(plan);
    const parsed = parseHolo(generated.contents);

    expect(plan.planText).toContain('- Generate native .holo source');
    expect(plan.generatedFilePath).toMatch(/\.holo$/);
    expect(generated.kind).toBe('.holo');
    expect(generated.path).toBe(plan.generatedFilePath);
    expect(parsed.success).toBe(true);
    expect(parsed.errors ?? []).toHaveLength(0);
    expect(generated.contents).toContain('ros2_topic');
  });

  it('records prompt, plan, artifact, target, smoke result, preview path, HoloKey, UmbrellaRoute, and triad receipt', () => {
    const plan = buildDescribeItPlan({
      prompt: 'A warehouse digital twin with live inventory zones.',
    });
    const generated = buildDescribeItPreview(plan);
    const smokeResult = buildDescribeItSmokeResult({
      generated,
      validation: { valid: true },
    });
    const receipt = buildDescribeItReceipt({
      plan,
      generated,
      smokeResult,
      createdAt: '2026-07-01T00:00:00.000Z',
    });
    const receiptValidation = validateDescribeItReceipt(receipt);

    expect(receiptValidation.valid).toBe(true);
    expect(receipt.promptHash).toBe(plan.promptHash);
    expect(receipt.planHash).toBe(plan.planHash);
    expect(receipt.generatedFiles[0]?.path).toBe(plan.generatedFilePath);
    expect(receipt.target).toBe('WebXR/WebGPU preview');
    expect(receipt.previewPath).toBe(plan.previewPath);
    expect(receipt.smokeResult.status).toBe('pass');
    expect(receipt.custody.holokey).toContain('holokey');
    expect(receipt.custody.umbrellaRoute).toContain('plan-review');
    expect(receipt.custody.triadReceipt.generatedArtifact).toBe(generated.hash);
  });

  it('fails smoke visibly when parse or preview checks fail', () => {
    const plan = buildDescribeItPlan({ prompt: 'A spatial app for field work orders.' });
    const generated = buildDescribeItPreview(plan);
    const smokeResult = buildDescribeItSmokeResult({
      generated,
      validation: { valid: false, errors: ['Generated HoloScript failed to parse'] },
      previewAvailable: false,
    });

    expect(smokeResult.status).toBe('fail');
    expect(smokeResult.checks.parserSmoke).toBe(false);
    expect(smokeResult.checks.previewAvailable).toBe(false);
    expect(smokeResult.errors).toContain('Generated HoloScript failed to parse');
    expect(smokeResult.errors).toContain('preview path unavailable');
  });
});
