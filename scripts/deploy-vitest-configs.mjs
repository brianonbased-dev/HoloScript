import { glob } from 'fs/promises';
import { copyFile, readdir, stat } from 'fs/promises';
import { join } from 'path';

async function main() {
  const pluginsDir = join(process.cwd(), 'packages', 'plugins');
  const templateConfig = join(pluginsDir, 'domain-plugin-template', 'vitest.config.ts');
  
  const entries = await readdir(pluginsDir);
  for (const entry of entries) {
    if (entry === 'domain-plugin-template') continue;
    
    const pluginPath = join(pluginsDir, entry);
    // Ignore files
    const s = await stat(pluginPath);
    if (!s.isDirectory()) continue;
    
    // Check if package.json exists to confirm it is a plugin
    try {
      const packageJsonPath = join(pluginPath, 'package.json');
      await stat(packageJsonPath);
      
      const targetConfig = join(pluginPath, 'vitest.config.ts');
      await copyFile(templateConfig, targetConfig);
      console.log(`Copied vitest.config.ts to ${entry}`);
    } catch(e) {
      // not a plugin
    }
  }
}

main().catch(console.error);
