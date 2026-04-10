import { createProviderManager } from '@holoscript/llm-provider';

const manager = createProviderManager();
const provider = manager.getProvider('bitnet');
const prompt =
  'Create a complete holo composition scene for: a minimal room with one cube. Include features: logic. Return only code with a composition root.';
const result = await provider!.generateHoloScript({
  prompt,
  targetFormat: 'holo',
  maxObjects: 8,
  temperature: 0.35,
});

const code = result.code;
const balanced = (code.match(/\{/g) || []).length === (code.match(/\}/g) || []).length;
const hasComposition = /\bcomposition(?:\s+"[^"]+")?\s*\{/i.test(code);
const hasSceneContent =
  code.includes('environment') ||
  code.includes('object ') ||
  code.includes('template ') ||
  /\b(cube|sphere|plane|cylinder|cone|torus|capsule|mesh|text|light|camera)\s*\{/i.test(code);

console.log(
  JSON.stringify(
    { valid: result.valid, errors: result.errors, balanced, hasComposition, hasSceneContent, code },
    null,
    2
  )
);
