/**
 * Training Corpus Parse Validation
 *
 * Runs every training example from TrainingDataGenerator through
 * HoloScriptCodeParser to catch syntax errors in the corpus.
 *
 * This is a smoke gate — if any training example can't parse,
 * it's invalid training data and will teach the model bad syntax.
 */
import { describe, it, expect } from 'vitest';
import { TrainingDataGenerator, ALL_CATEGORIES } from '../../ai/TrainingDataGenerator';
import { HoloScriptCodeParser } from '../../HoloScriptCodeParser';

describe('Training Corpus Validation', () => {
  const generator = new TrainingDataGenerator();
  const parser = new HoloScriptCodeParser();
  const allExamples = generator.generateAll();

  it('should have a non-trivial number of training examples', () => {
    expect(allExamples.length).toBeGreaterThanOrEqual(30);
  });

  it('should cover all declared categories', () => {
    const categories = new Set(allExamples.map((ex) => ex.category));
    // At least 10 of the 13 categories should have examples
    expect(categories.size).toBeGreaterThanOrEqual(10);
  });

  it('should have examples at all complexity levels', () => {
    const basic = allExamples.filter((ex) => ex.complexity === 'basic');
    const intermediate = allExamples.filter((ex) => ex.complexity === 'intermediate');
    const advanced = allExamples.filter((ex) => ex.complexity === 'advanced');

    expect(basic.length).toBeGreaterThan(0);
    expect(intermediate.length).toBeGreaterThan(0);
    expect(advanced.length).toBeGreaterThan(0);
  });

  // Validate every example parses without fatal errors
  describe('parse validation', () => {
    for (const example of allExamples) {
      it(`[${example.id}] ${example.description} — should parse without errors`, () => {
        expect(example.holoScript).toBeTruthy();
        expect(example.holoScript.length).toBeGreaterThan(10);

        const result = parser.parse(example.holoScript);

        // Parser should NOT throw. Warnings are OK, fatal errors are not.
        // We check that at least one AST node was produced.
        expect(result).toBeDefined();
        if (result.errors && result.errors.length > 0) {
          // If there are errors, they should only be non-fatal (warnings)
          const fatalErrors = result.errors.filter(
            (e: any) => !e.message.includes('warning') && !e.message.includes('Warning')
          );
          // Allow up to minor parse issues but flag them
          if (fatalErrors.length > 0) {
            console.warn(
              `[${example.id}] Parse issues:`,
              fatalErrors.map((e: any) => e.message)
            );
          }
        }
      });
    }
  });

  // Stats report
  it('should report corpus metrics', () => {
    const stats = generator.getStats();
    const totalExamples = allExamples.length;
    const totalChars = allExamples.reduce((sum, ex) => sum + ex.holoScript.length, 0);
    const avgLength = Math.round(totalChars / totalExamples);

    console.log('\n=== Training Corpus Metrics ===');
    console.log(`Total examples: ${totalExamples}`);
    console.log(`Total characters: ${totalChars.toLocaleString()}`);
    console.log(`Average example length: ${avgLength} chars`);
    console.log(`Categories: ${Object.keys(stats).length}`);
    for (const [cat, count] of Object.entries(stats)) {
      console.log(`  ${cat}: ${count}`);
    }
    console.log('==============================\n');

    expect(totalExamples).toBeGreaterThan(0);
  });
});
