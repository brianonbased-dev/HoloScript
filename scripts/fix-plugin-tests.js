const fs = require('fs');
const path = require('path');

const pluginDir = path.join(process.cwd(), 'packages', 'plugins');
const plugins = fs.readdirSync(pluginDir).filter(f => fs.statSync(path.join(pluginDir, f)).isDirectory());

const config = `import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['src/**/*.test.ts'],
    passWithNoTests: true,
  },
});
`;

let count = 0;
plugins.forEach(p => {
  fs.writeFileSync(path.join(pluginDir, p, 'vitest.config.ts'), config);
  count++;
});
console.log('Wrote vitest configs for ' + count + ' plugins!');
