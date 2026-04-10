/**
 * Basic plugin template
 */

export const basicPluginTemplate = `import { HoloScriptPlugin } from '@holoscript/studio-plugin-sdk';

export const {{pluginName}}Plugin: HoloScriptPlugin = {
  metadata: {
    id: '{{pluginId}}',
    name: '{{pluginDisplayName}}',
    version: '1.0.0',
    description: '{{pluginDescription}}',
    author: {
      name: '{{authorName}}',
      email: '{{authorEmail}}',
    },
    license: 'MIT',
    icon: 'Package',
  },

  onLoad: () => {
    console.log('{{pluginDisplayName}} loaded!');
  },

  onUnload: () => {
    console.log('{{pluginDisplayName}} unloaded');
  },
};

export default {{pluginName}}Plugin;
`;

export const basicPluginPackageJson = `{
  "name": "@holoscript-plugins/{{pluginId}}",
  "version": "1.0.0",
  "description": "{{pluginDescription}}",
  "type": "module",
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "scripts": {
    "build": "tsc",
    "dev": "tsc --watch"
  },
  "keywords": ["holoscript", "studio", "plugin"],
  "author": "{{authorName}}",
  "license": "MIT",
  "peerDependencies": {
    "react": "^19.0.0"
  },
  "devDependencies": {
    "@holoscript/studio-plugin-sdk": "^1.0.0",
    "@types/react": "^19.0.0",
    "typescript": "~5.9.3"
  }
}
`;

export const basicPluginTsConfig = `{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "lib": ["ES2022", "DOM"],
    "jsx": "react-jsx",
    "moduleResolution": "bundler",
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true,
    "outDir": "./dist",
    "rootDir": "./src",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist"]
}
`;

export const basicPluginReadme = `# {{pluginDisplayName}}

{{pluginDescription}}

## Installation

\`\`\`bash
npm install @holoscript-plugins/{{pluginId}}
\`\`\`

## Usage

1. Open HoloScript Studio
2. Open Plugin Manager (Ctrl+P)
3. Click "Install Plugin"
4. Enter: \`@holoscript-plugins/{{pluginId}}\`
5. Click "Install"
6. Enable the plugin

## Development

\`\`\`bash
npm install
npm run dev
\`\`\`

## License

MIT © {{authorName}}
`;
