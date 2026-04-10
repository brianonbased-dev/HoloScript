import { ConfigLoader } from '../packages/cli/src/config/loader';
import * as fs from 'fs';
import * as path from 'path';

async function testCircularDependency() {
  const testDir = path.resolve('temp_test_circular');
  if (!fs.existsSync(testDir)) fs.mkdirSync(testDir);

  const configA = { extends: './configB.json' };
  const configB = { extends: './configA.json' };

  fs.writeFileSync(path.join(testDir, 'configA.json'), JSON.stringify(configA, null, 2));
  fs.writeFileSync(path.join(testDir, 'configB.json'), JSON.stringify(configB, null, 2));

  console.log('Testing circular dependency detection...');

  try {
    const loader = new ConfigLoader();
    await loader.loadConfig(path.join(testDir, 'configA.json'));
    console.log('\n\x1b[31m✗ Circular Dependency Test Failed (No error thrown)!\x1b[0m');
    process.exit(1);
  } catch (error: any) {
    if (error.message.includes('Circular dependency detected')) {
      console.log('Error caught correctly:', error.message);
      console.log('\n\x1b[32m✓ Circular Dependency Test Passed!\x1b[0m');
    } else {
      console.error('\x1b[31mWrong Error caught:\x1b[0m', error.message);
      process.exit(1);
    }
  } finally {
    // Cleanup
    // fs.rmSync(testDir, { recursive: true, force: true });
  }
}

testCircularDependency();
