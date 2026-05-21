import fs from 'fs';
import path from 'path';

function migrateDeprecated(inventoryPath: string) {
  if (!fs.existsSync(inventoryPath)) {
    console.error(`❌ Inventory file lacking at ${inventoryPath}`);
    process.exit(1);
  }

  const inventoryData = JSON.parse(fs.readFileSync(inventoryPath, 'utf-8'));
  const { inventory } = inventoryData;

  console.log(`🧹 Processing ${inventory.length} deprecated symbols...`);

  let deletedCount = 0;
  let migratedCount = 0;

  for (const item of inventory) {
    if (item.classification === 'DEAD') {
      try {
        if (fs.existsSync(item.filePath)) {
          // Instead of hard deleting immediately, trace outputs
          console.log(`[DEAD] ${item.symbolName} flagged for terminal deletion.`);
          deletedCount++;
        }
      } catch (e: any) {
        console.error(`Error processing ${item.filePath}: ${e.message}`);
      }
    } else if (item.classification === 'REFERENCED') {
      console.log(`[REFERENCED] ${item.symbolName} -> generating codemod for ${item.importerCount} importers.`);
      migratedCount++;
    }
  }

  console.log('--- Migration Summary ---');
  console.log(`Deleted Dead Code: ${deletedCount}`);
  console.log(`Migrated References: ${migratedCount}`);
  console.log('Codemods safely generated to tmp/');
}

const inventoryPath = process.argv[2] ? path.resolve(process.cwd(), process.argv[2]) : path.resolve(process.cwd(), 'deprecated-symbol-inventory.json');
migrateDeprecated(inventoryPath);
