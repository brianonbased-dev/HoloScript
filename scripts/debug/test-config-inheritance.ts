import { ConfigLoader } from '../packages/cli/src/config/loader';
import * as fs from 'fs';
import * as path from 'path';

async function testConfigInheritance() {
  const testDir = path.resolve('temp_test_config');
  if (!fs.existsSync(testDir)) fs.mkdirSync(testDir);

  const baseConfig = {
    compilerOptions: {
      target: 'threejs',
      strict: true,
    },
    formatOptions: {
      indentSize: 2,
    },
  };

  const childConfig = {
    extends: './base.json',
    compilerOptions: {
      target: 'unity',
    },
    project: {
      name: 'Test Project',
    },
  };

  fs.writeFileSync(path.join(testDir, 'base.json'), JSON.stringify(baseConfig, null, 2));
  fs.writeFileSync(
    path.join(testDir, 'holoscript.config.json'),
    JSON.stringify(childConfig, null, 2)
  );

  console.log('Testing config loading and inheritance...');

  try {
    const loader = new ConfigLoader();
    const resolvedConfig = await loader.loadConfig(path.join(testDir, 'holoscript.config.json'));

    console.log('Resolved Config:', JSON.stringify(resolvedConfig, null, 2));

    // Assertions
    const success =
      resolvedConfig.compilerOptions?.target === 'unity' && // Overridden
      resolvedConfig.compilerOptions?.strict === true && // Inherited
      resolvedConfig.formatOptions?.indentSize === 2 && // Inherited
      resolvedConfig.project?.name === 'Test Project'; // Child-only

    if (success) {
      console.log('\n\x1b[32m✓ Config Inheritance Test Passed!\x1b[0m');
    } else {
      console.log('\n\x1b[31m✗ Config Inheritance Test Failed!\x1b[0m');
      process.exit(1);
    }
  } catch (error) {
    console.error('\x1b[31mTest Error:\x1b[0m', error);
    process.exit(1);
  } finally {
    // Cleanup
    // fs.rmSync(testDir, { recursive: true, force: true });
  }
}

testConfigInheritance();
