#!/usr/bin/env tsx
/**
 * Generates brittney-hololand-v1.jsonl training dataset
 */
import { generateHololandDataset, datasetToJsonl } from '../packages/mcp-server/src/training-generators';
import { writeFileSync } from 'fs';
import { join } from 'path';

const examples = generateHololandDataset(4);
const jsonl = datasetToJsonl(examples);
const outPath = join(import.meta.dirname ?? __dirname, '../packages/mcp-server/brittney-hololand-v1.jsonl');
writeFileSync(outPath, jsonl, 'utf-8');

const categories = [...new Set(examples.map(e => e.metadata.category))];
const difficulties = [...new Set(examples.map(e => e.metadata.difficulty))];

console.log(`✅ Generated ${examples.length} training examples`);
console.log(`   Categories: ${categories.join(', ')}`);
console.log(`   Difficulties: ${difficulties.join(', ')}`);
console.log(`   File size: ${(Buffer.byteLength(jsonl, 'utf-8') / 1024).toFixed(1)} KB`);
console.log(`   Saved to: ${outPath}`);
