import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// Resolve directory paths
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '../');
const CORE_DIR = path.resolve(ROOT_DIR, 'packages/core');
const REGISTRY_PATH = path.resolve(CORE_DIR, 'src/traits/trait-registry.json');
const REPORT_PATH = path.resolve(ROOT_DIR, 'scripts/tm-traits-validation-report.json');

async function runValidation() {
  console.log('🔍 Validating TrainingMonkey traits against unified HS Registry...');

  if (!fs.existsSync(REGISTRY_PATH)) {
    console.error(`❌ Registry not found at ${REGISTRY_PATH}. Run 'pnpm run build' or the generate-trait-registry script first.`);
    process.exit(1);
  }

  const rawRegistry = JSON.parse(fs.readFileSync(REGISTRY_PATH, 'utf-8'));
  const hsTraitIds = new Set<string>(Object.keys(rawRegistry));

  console.log(`📊 Loaded ${hsTraitIds.size} canonical trait IDs from registry.`);

  // Dynamically import Mappings 
  // We use relative path or tsx resolution to the core source
  const mappingsPath = path.resolve(CORE_DIR, 'src/training/trait-mappings.ts');
  
  if (!fs.existsSync(mappingsPath)) {
      console.error(`❌ Mappings not found at ${mappingsPath}`);
      process.exit(1);
  }

  // To avoid dealing with ES module resolution issues within tsx of external packages,
  // we will parse the file or rely on the build if it exists. 
  // But wait, we can just import from the source using standard syntax in this env:
  const { TM_REGISTERED_TRAITS, generateValidationReport } = await import('../packages/framework/src/training/trait-mappings');

  // Generate Report
  const deprecatedTraits = new Set<string>();
  for (const [id, def] of Object.entries(rawRegistry)) {
    if ((def as any).deprecated) {
      deprecatedTraits.add(id);
    }
  }

  const report = generateValidationReport(TM_REGISTERED_TRAITS, hsTraitIds, deprecatedTraits);

  console.log('\n--- Validation Result ---');
  console.log(`Matched: ${report.matched}`);
  console.log(`Unmatched: ${report.unmatched}`);
  console.log(`Deprecated: ${report.deprecated}`);
  console.log(`Total TM Traits Eval: ${report.total}`);

  fs.writeFileSync(REPORT_PATH, JSON.stringify(report, null, 2), 'utf-8');
  console.log(`\n💾 Saved detailed report to ${REPORT_PATH}`);
}

runValidation().catch(console.error);
