import * as fs from 'fs';
import * as path from 'path';
import AdmZip from 'adm-zip';
import { HoloSmartAssetSchema } from '@holoscript/sdk/schema';

const SMART_ASSET_FILE = 'smart-asset.json';

export async function packAsset(
  inputDir: string,
  outputPath: string | undefined,
  verbose: boolean
): Promise<void> {
  const absInput = path.resolve(inputDir);

  if (!fs.existsSync(absInput) || !fs.statSync(absInput).isDirectory()) {
    throw new Error(`Input directory not found: ${absInput}`);
  }

  // 1. Validate smart-asset.json presence
  const descriptorPath = path.join(absInput, SMART_ASSET_FILE);
  if (!fs.existsSync(descriptorPath)) {
    throw new Error(`Missing ${SMART_ASSET_FILE} in directory.`);
  }

  // 2. Validate Schema
  const content = fs.readFileSync(descriptorPath, 'utf-8');
  let json;
  try {
    json = JSON.parse(content);
  } catch (_e) {
    throw new Error(`Invalid JSON in ${SMART_ASSET_FILE}`);
  }

  const validation = HoloSmartAssetSchema.safeParse(json);
  if (!validation.success) {
    console.error(`\x1b[31mSchema Validation Failed:\x1b[0m`);
    validation.error.errors.forEach((err) => {
      console.error(`  ${err.path.join('.')}: ${err.message}`);
    });
    throw new Error(`Invalid Smart Asset descriptor.`);
  }

  if (verbose) console.log(`\x1b[32m✓ Schema validated.\x1b[0m`);

  // 3. Create Zip
  const zip = new AdmZip();
  zip.addLocalFolder(absInput);

  // Determine output path
  let finalOutput = outputPath;
  if (!finalOutput) {
    const dirName = path.basename(absInput);
    finalOutput = path.join(path.dirname(absInput), `${dirName}.hsa`);
  }

  if (verbose) console.log(`Packing to ${finalOutput}...`);

  zip.writeZip(finalOutput);
  console.log(`\x1b[32m✓ Packed Smart Asset: ${finalOutput}\x1b[0m`);
}

export async function unpackAsset(
  inputPath: string,
  outputDir: string | undefined,
  verbose: boolean
): Promise<void> {
  const absInput = path.resolve(inputPath);

  if (!fs.existsSync(absInput)) {
    throw new Error(`Input file not found: ${absInput}`);
  }

  // Determine output directory
  let finalOutput = outputDir;
  if (!finalOutput) {
    const baseName = path.basename(absInput, '.hsa');
    finalOutput = path.join(path.dirname(absInput), baseName);
  }

  if (verbose) console.log(`Unpacking to ${finalOutput}...`);

  // Create output dir if not exists (done by adm-zip extractAllTo usually, but good to be explicit)
  if (!fs.existsSync(finalOutput)) {
    fs.mkdirSync(finalOutput, { recursive: true });
  }

  const zip = new AdmZip(absInput);

  // Verify it contains smart-asset.json
  if (zip.getEntry(SMART_ASSET_FILE) === null) {
    throw new Error(`Invalid HSA archive: missing ${SMART_ASSET_FILE}`);
  }

  zip.extractAllTo(finalOutput, true);
  console.log(`\x1b[32m✓ Unpacked to: ${finalOutput}\x1b[0m`);
}

export async function inspectAsset(inputPath: string, _verbose: boolean): Promise<void> {
  const absInput = path.resolve(inputPath);

  if (!fs.existsSync(absInput)) {
    throw new Error(`Input file not found: ${absInput}`);
  }

  const zip = new AdmZip(absInput);
  const entry = zip.getEntry(SMART_ASSET_FILE);
  if (!entry) {
    throw new Error(`Invalid HSA archive: missing ${SMART_ASSET_FILE}`);
  }

  const content = entry.getData().toString('utf-8');
  const json = JSON.parse(content);

  // Basic display
  console.log(`\n\x1b[1mSmart Asset Inspection: ${path.basename(inputPath)}\x1b[0m\n`);

  console.log(`\x1b[36mMetadata:\x1b[0m`);
  console.log(`  Name: ${json.metadata.name}`);
  console.log(`  Version: ${json.metadata.version}`);
  if (json.metadata.author) console.log(`  Author: ${json.metadata.author}`);
  if (json.metadata.description) console.log(`  Description: ${json.metadata.description}`);

  if (json.physics) {
    console.log(`\n\x1b[36mPhysics:\x1b[0m`);
    console.log(JSON.stringify(json.physics, null, 2).replace(/^/gm, '  '));
  }

  if (json.ai) {
    console.log(`\n\x1b[36mAI:\x1b[0m`);
    console.log(JSON.stringify(json.ai, null, 2).replace(/^/gm, '  '));
  }

  console.log(`\n\x1b[36mScript Code:\x1b[0m\n`);
  // Show first 10 lines of script
  const scriptLines = json.script.split('\n');
  console.log(scriptLines.slice(0, 10).join('\n'));
  if (scriptLines.length > 10)
    console.log(`\x1b[2m... (${scriptLines.length - 10} more lines)\x1b[0m`);

  console.log('');
}
