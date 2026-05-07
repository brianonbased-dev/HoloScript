#!/usr/bin/env node
const fs = require('node:fs/promises');
const path = require('node:path');

(async () => {
  const { Command } = await import('commander');
  const prompts = (await import('prompts')).default;
  const chalk = (await import('chalk')).default;

  const program = new Command();

  program
    .name('create-holoscript-plugin')
    .description('Create a new HoloScript Studio plugin')
    .argument('[plugin-name]', 'Plugin name (e.g., my-awesome-plugin)')
    .option('-t, --template <template>', 'Plugin template (basic|panel|nodeType|fullFeatured)', 'basic')
    .option('-d, --directory <dir>', 'Output directory', process.cwd())
    .action(async (pluginNameArg, options) => {
      console.log(chalk.bold.cyan('\nCreate HoloScript Studio Plugin\n'));

      let pluginId = pluginNameArg;
      if (!pluginId) {
        const response = await prompts({
          type: 'text',
          name: 'pluginId',
          message: 'Plugin name (e.g., my-awesome-plugin):',
          validate: (value) => {
            if (!value) return 'Plugin name is required';
            if (!/^[a-z0-9-]+$/.test(value)) {
              return 'Plugin name must contain only lowercase letters, numbers, and hyphens';
            }
            return true;
          },
        });

        if (!response.pluginId) {
          console.log(chalk.yellow('\nPlugin creation cancelled\n'));
          process.exit(0);
        }

        pluginId = response.pluginId;
      }

      const answers = await prompts([
        {
          type: 'select',
          name: 'template',
          message: 'Plugin template:',
          choices: [
            { title: 'Basic - Simple plugin with lifecycle hooks', value: 'basic' },
            { title: 'Panel - Plugin with custom UI panel', value: 'panel' },
            { title: 'Node Type - Plugin with custom workflow/BT nodes', value: 'nodeType' },
            { title: 'Full-Featured - All plugin capabilities', value: 'fullFeatured' },
          ],
          initial: options.template === 'basic' ? 0 : options.template === 'panel' ? 1 : options.template === 'nodeType' ? 2 : 3,
        },
        {
          type: 'text',
          name: 'pluginDisplayName',
          message: 'Display name:',
          initial: pluginId
            .split('-')
            .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
            .join(' '),
        },
        {
          type: 'text',
          name: 'pluginDescription',
          message: 'Description:',
          initial: 'A HoloScript Studio plugin',
        },
        {
          type: 'text',
          name: 'authorName',
          message: 'Author name:',
          initial: 'Your Name',
        },
        {
          type: 'text',
          name: 'authorEmail',
          message: 'Author email (optional):',
          initial: '',
        },
      ]);

      const { template, pluginDisplayName, pluginDescription, authorName, authorEmail } = answers;
      const pluginName = pluginId
        .split('-')
        .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
        .join('');
      const pluginDir = path.join(options.directory, pluginId);

      try {
        await fs.mkdir(pluginDir, { recursive: true });
        await fs.mkdir(path.join(pluginDir, 'src'), { recursive: true });

        if (template === 'panel' || template === 'fullFeatured') {
          await fs.mkdir(path.join(pluginDir, 'src', 'components'), { recursive: true });
        }

        console.log(chalk.green(`\nCreated directory: ${pluginDir}`));

        const templates = await import('../dist/templates/index.js');
        const replacements = {
          pluginId,
          pluginName,
          pluginDisplayName,
          pluginDescription,
          authorName,
          authorEmail: authorEmail || 'your@email.com',
          authorUrl: '',
          homepage: '',
          iconName: 'Package',
          keywords: '"holoscript", "studio", "plugin"',
          panelComponentName: `${pluginName}Panel`,
          panelId: `${pluginId}-panel`,
          panelLabel: `${pluginDisplayName} Panel`,
          keyboardShortcut: 'Ctrl+Shift+P',
          nodeType: `${pluginId}-node`,
          nodeLabel: `${pluginDisplayName} Node`,
          nodeCategory: 'Custom',
          nodeIcon: 'Zap',
          nodeDescription: 'Custom node',
          btNodeType: `${pluginId}-bt-node`,
          btNodeLabel: `${pluginDisplayName} BT Node`,
          btNodeDescription: 'Custom behavior tree node',
          buttonId: `${pluginId}-button`,
          buttonLabel: pluginDisplayName,
          buttonTooltip: `Open ${pluginDisplayName}`,
          shortcutId: `${pluginId}-shortcut`,
          shortcutDescription: `Toggle ${pluginDisplayName}`,
          menuItemId: `${pluginId}-menu`,
          menuItemLabel: pluginDisplayName,
          contentType: pluginId,
          contentTypeLabel: pluginDisplayName,
          fileExtension: pluginId.replace(/-/g, ''),
          mcpServerId: `${pluginId}-mcp`,
          mcpServerName: `${pluginDisplayName} MCP Server`,
          mcpServerUrl: 'http://localhost:5000',
          mcpServerDescription: 'Custom MCP server',
        };

        const replace = (templateText) => {
          let result = templateText;
          for (const [key, value] of Object.entries(replacements)) {
            result = result.replace(new RegExp(`{{${key}}}`, 'g'), value);
          }
          return result;
        };

        let pluginCode;
        switch (template) {
          case 'panel':
            pluginCode = replace(templates.panelPluginTemplate);
            await fs.writeFile(
              path.join(pluginDir, 'src', 'components', `${pluginName}Panel.tsx`),
              replace(templates.panelComponentTemplate)
            );
            break;
          case 'nodeType':
            pluginCode = replace(templates.nodeTypePluginTemplate);
            break;
          case 'fullFeatured':
            pluginCode = replace(templates.fullFeaturedPluginTemplate);
            await fs.writeFile(
              path.join(pluginDir, 'src', 'components', `${pluginName}Panel.tsx`),
              replace(templates.panelComponentTemplate)
            );
            break;
          default:
            pluginCode = replace(templates.basicPluginTemplate);
            break;
        }

        await fs.writeFile(path.join(pluginDir, 'src', 'index.ts'), pluginCode);
        await fs.writeFile(path.join(pluginDir, 'package.json'), replace(templates.basicPluginPackageJson));
        await fs.writeFile(path.join(pluginDir, 'tsconfig.json'), replace(templates.basicPluginTsConfig));
        await fs.writeFile(path.join(pluginDir, 'README.md'), replace(templates.basicPluginReadme));
        await fs.writeFile(path.join(pluginDir, '.gitignore'), 'node_modules\ndist\n*.log\n.DS_Store\n');

        console.log(chalk.green('Plugin files created successfully!\n'));
        console.log(chalk.bold('Next steps:\n'));
        console.log(chalk.cyan(`  cd ${pluginId}`));
        console.log(chalk.cyan('  npm install'));
        console.log(chalk.cyan('  npm run build'));
        console.log();
        console.log(chalk.bold('To use your plugin:\n'));
        console.log('  1. Open HoloScript Studio');
        console.log('  2. Press Ctrl+P to open Plugin Manager');
        console.log('  3. Click "Install from File"');
        console.log(`  4. Select ${path.join(pluginDir, 'dist', 'index.js')}`);
        console.log();
        console.log(chalk.green('Happy plugin development!\n'));
      } catch (error) {
        console.error(chalk.red(`\nError creating plugin: ${error.message}\n`));
        process.exit(1);
      }
    });

  program.parse();
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
