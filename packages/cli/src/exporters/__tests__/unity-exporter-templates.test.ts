import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

describe('Unity Exporter Templates', () => {
  it('should have perfectly balanced braces in all generateHolo template strings', () => {
    // We parse the source file itself to check the raw templates
    const exporterFile = path.resolve(__dirname, '../unity-exporter.ts');
    const src = fs.readFileSync(exporterFile, 'utf-8');

    // Matches any function generateHolo*(): string { return `...`; }
    const regex = /function\s+generateHolo[A-Za-z]+\(\)\s*:\s*string\s*\{[\s\S]*?return\s*`([\s\S]*?)`;/g;
    
    let match;
    let checkedCount = 0;
    const errors: string[] = [];

    while ((match = regex.exec(src)) !== null) {
      checkedCount++;
      const content = match[1];
      
      let depth = 0;
      let failed = false;
      for (let i = 0; i < content.length; i++) {
        if (content[i] === '{') depth++;
        if (content[i] === '}') depth--;
        if (depth < 0) {
          errors.push(`Mismatched braces (extra '}') in template near index ${i}`);
          failed = true;
          break;
        }
      }
      
      if (!failed && depth > 0) {
        errors.push(`Mismatched braces (missing '}') in template. Depth at end: ${depth}`);
      }
    }

    expect(checkedCount).toBeGreaterThan(0); // Ensure the test regex successfully finds templates
    expect(errors).toEqual([]); // Ensure zero mismatch errors
  });
});
