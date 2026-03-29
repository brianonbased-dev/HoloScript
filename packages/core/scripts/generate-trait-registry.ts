import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// Resolve directory paths correctly if run via Node
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const CORE_DIR = path.resolve(__dirname, '../');

async function generateRegistry() {
  console.log('🔄 Scanning @holoscript/core trait exports...');
  
  // We dynamically import from the compiled index or source index
  const traitsModule = await import('../src/traits/index');
  const { defaultTraitRegistry } = await import('../src/traits/TraitDefinition');

  let importedCount = 0;
  
  // Find all exported TraitDefinition objects (they have id, category, properties)
  for (const [key, exp] of Object.entries(traitsModule)) {
    if (exp && typeof exp === 'object' && 'id' in exp && 'category' in exp && Array.isArray((exp as any).properties)) {
      // Actually, if it's already a TraitDefinition, register it
      if (!defaultTraitRegistry.has((exp as any).id)) {
        defaultTraitRegistry.register(exp as any);
        importedCount++;
      }
    }
    // Also support trait handlers (they usually have 'name' mapping to id and might contain a meta block)
    if (exp && typeof exp === 'object' && 'name' in exp && 'defaultConfig' in exp) {
      const handler = exp as any;
      if (!defaultTraitRegistry.has(handler.name)) {
        defaultTraitRegistry.register({
          id: handler.name,
          namespace: handler.namespace || '@holoscript/core',
          category: handler.category || 'other',
          properties: handler.properties || [],
          compileHints: handler.compileHints || [],
          composable: handler.composable || [],
          conflicts: handler.conflicts || [],
          source: 'holoscript',
          training: handler.training
        });
        importedCount++;
      }
    }
  }

  console.log(`✅ Loaded ${importedCount} traits into the local register.`);
  console.log(`📊 Registry Size: ${defaultTraitRegistry.size} total traits.`);
  
  const summary = defaultTraitRegistry.getSummary();
  console.log('--- Summary ---');
  console.log(summary);
  
  const outputPath = path.resolve(CORE_DIR, 'src/traits/trait-registry.json');
  fs.writeFileSync(outputPath, JSON.stringify(defaultTraitRegistry.toJSON(), null, 2), 'utf-8');
  console.log(`💾 Successfully saved trait-registry.json to ${outputPath}`);
}

generateRegistry().catch(console.error);
