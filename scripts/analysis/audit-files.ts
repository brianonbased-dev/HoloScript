import fs from 'fs';
import path from 'path';
import { HoloScriptPlusParser } from '../packages/core/src/parser/HoloScriptPlusParser';

const TARGET_DIRS = [
  'c:/Users/josep/Documents/GitHub/HoloScript',
  'c:/Users/josep/Documents/GitHub/Hololand',
];

const EXTENSIONS = ['.hs', '.holo', '.hsplus'];

function findFiles(dir: string, fileList: string[] = []) {
  if (!fs.existsSync(dir)) return fileList;
  const files = fs.readdirSync(dir);
  for (const file of files) {
    const filePath = path.join(dir, file);
    const stat = fs.statSync(filePath);
    if (stat.isDirectory()) {
      if (file !== 'node_modules' && file !== '.git') {
        findFiles(filePath, fileList);
      }
    } else {
      if (EXTENSIONS.includes(path.extname(file))) {
        fileList.push(filePath);
      }
    }
  }
  return fileList;
}

async function auditFiles() {
  console.log('Starting HoloScript Source File Audit...');
  console.log(`Target Directories: ${TARGET_DIRS.join(', ')}`);

  const allFiles: string[] = [];
  for (const dir of TARGET_DIRS) {
    findFiles(dir, allFiles);
  }

  console.log(`Found ${allFiles.length} files.`);

  const parser = new HoloScriptPlusParser();
  let validCount = 0;
  let invalidCount = 0;
  const errors: { file: string; error: any }[] = [];

  for (const file of allFiles) {
    const content = fs.readFileSync(file, 'utf8');
    try {
      const result = parser.parse(content);
      if (result.success) {
        validCount++;
        // console.log(`✅ ${path.basename(file)}`);
      } else {
        invalidCount++;
        console.log(`❌ ${path.basename(file)}`);
        errors.push({ file, error: result.errors });
      }
    } catch (e: any) {
      invalidCount++;
      console.log(`💀 ${path.basename(file)} (Crash)`);
      errors.push({ file, error: e.message });
    }
  }

  const reportPath = 'source_files_audit_report.txt';
  const reportLines = [
    `HoloScript Source File Audit Report`,
    `===================================`,
    `Date: ${new Date().toISOString()}`,
    `Total Files: ${allFiles.length}`,
    `Valid: ${validCount} (${((validCount / allFiles.length) * 100).toFixed(1)}%)`,
    `Invalid: ${invalidCount}`,
    ``,
    `Invalid Files Details:`,
    `----------------------`,
  ];

  errors.forEach(({ file, error }) => {
    reportLines.push(`File: ${file}`);
    if (Array.isArray(error)) {
      error.forEach((err: any) => reportLines.push(`  - Line ${err.line}: ${err.message}`));
    } else {
      reportLines.push(`  - Crash: ${error}`);
    }
    reportLines.push('');
  });

  fs.writeFileSync(reportPath, reportLines.join('\n'));
  console.log(`Audit complete. Report saved to ${reportPath}`);
  console.log(`Valid: ${validCount}, Invalid: ${invalidCount}`);
}

auditFiles();
