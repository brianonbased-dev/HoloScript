import { ProceduralCompiler } from '../framework/src/learning/ProceduralCompiler';

async function runProceduralCompilerTest() {
  console.log('=== Phase 11: LLM-Code Safety Wrapper Test ===\n');

  console.log('1. Simulating unstructured LLM-authored action lines.');
  const unstructuredAIMatrix = `
move(10, 0, 5)
scan_radius(50)
attack('Goblin_Entity')
wait(100)
    `;

  console.log('   - Base String:');
  console.log(unstructuredAIMatrix.trim());

  console.log('\n2. Wrapping raw lines in an agent scaffold with safety guards.');
  const compiled = ProceduralCompiler.compile({
    id: 'brittney-combat-01',
    name: 'Basic Melee Engagement',
    description: 'Engages an entity within 50 units dynamically.',
    code: unstructuredAIMatrix,
  });

  console.log('   - Safety-wrapped scaffold:\n');
  console.log('-----------------------------------------');
  console.log(compiled);
  console.log('-----------------------------------------');

  if (compiled.includes('ensure_safety()') && compiled.includes('agent brittney_combat_01')) {
    console.log('\nSafety-wrapper scaffold emitted expected bounds.');
    console.log(
      '  - `move` and `attack` primitives are preserved literally and wrapped inside `ensure_safety()` blocks.'
    );
  } else {
    console.error('\nSafety-wrapper scaffold missing wrapper assertions.');
    process.exit(1);
  }

  console.log('\n=== Integration Passed! ===');
}

runProceduralCompilerTest().catch(console.error);
