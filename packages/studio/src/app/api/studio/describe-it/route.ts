import { NextResponse } from 'next/server';

import { readJsonBody } from '../../_lib/body-size';
import { validateGeneratedHoloOutput } from '@/lib/brittney/generatedOutputGate';
import {
  DESCRIBE_IT_EXAMPLES,
  buildDescribeItPlan,
  buildDescribeItPreview,
  buildDescribeItReceipt,
  buildDescribeItSmokeResult,
  isDescribeItTarget,
  validateDescribeItReceipt,
} from '@/lib/studio/describe-it/describeItFirstRun';

type DescribeItRequest = {
  mode?: unknown;
  prompt?: unknown;
  target?: unknown;
  planText?: unknown;
  previewAvailable?: unknown;
};

export function GET() {
  return NextResponse.json({ examples: DESCRIBE_IT_EXAMPLES });
}

export async function POST(request: Request) {
  const parsed = await readJsonBody<DescribeItRequest>(request, { maxBytes: 24_000 });
  if (parsed.ok === false) {
    return NextResponse.json({ success: false, error: parsed.error }, { status: parsed.status });
  }

  const { mode = 'generate', prompt, target, planText, previewAvailable } = parsed.body;
  if (typeof prompt !== 'string' || prompt.trim().length === 0) {
    return NextResponse.json({ success: false, error: 'prompt is required' }, { status: 400 });
  }
  if (mode !== 'plan' && mode !== 'generate') {
    return NextResponse.json(
      { success: false, error: 'mode must be plan or generate' },
      { status: 400 }
    );
  }

  const plan = buildDescribeItPlan({
    prompt,
    target: isDescribeItTarget(target) ? target : undefined,
    planText: typeof planText === 'string' ? planText : undefined,
  });

  if (mode === 'plan') {
    return NextResponse.json({ success: true, plan, examples: DESCRIBE_IT_EXAMPLES });
  }

  const generated = buildDescribeItPreview(plan);
  const validation = validateGeneratedHoloOutput(generated.contents);
  const smokeResult = buildDescribeItSmokeResult({
    generated,
    validation,
    previewAvailable: typeof previewAvailable === 'boolean' ? previewAvailable : true,
  });
  const receipt = buildDescribeItReceipt({ plan, generated, smokeResult });
  const receiptValidation = validateDescribeItReceipt(receipt);

  if (!receiptValidation.valid) {
    const failedSmoke = buildDescribeItSmokeResult({
      generated,
      validation,
      previewAvailable: typeof previewAvailable === 'boolean' ? previewAvailable : true,
      receiptComplete: false,
    });
    const failedReceipt = buildDescribeItReceipt({ plan, generated, smokeResult: failedSmoke });
    return NextResponse.json({
      success: true,
      plan,
      generated,
      receipt: failedReceipt,
      smokeResult: failedSmoke,
      receiptErrors: receiptValidation.errors,
    });
  }

  return NextResponse.json({
    success: true,
    plan,
    generated,
    receipt,
    smokeResult,
  });
}
