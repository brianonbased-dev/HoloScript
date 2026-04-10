import { createProviderManager } from '@holoscript/llm-provider';

const manager = createProviderManager();
const provider = manager.getProvider('bitnet');
if (!provider) {
  console.log(JSON.stringify({ ok: false, reason: 'bitnet provider missing' }, null, 2));
  process.exit(1);
}

const result = await provider.generateHoloScript({
  prompt:
    'Create a complete holo composition scene for: a minimal room with one cube. Include features: logic. Return only code with a composition root.',
  targetFormat: 'holo',
  maxObjects: 8,
  temperature: 0.35,
});

console.log(
  JSON.stringify(
    {
      ok: true,
      provider: result.provider,
      valid: result.valid,
      errors: result.errors,
      code: result.code,
    },
    null,
    2
  )
);
