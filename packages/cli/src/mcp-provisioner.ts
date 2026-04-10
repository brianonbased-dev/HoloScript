import fs from 'fs';
import path from 'path';
import os from 'os';

/**
 * Automatically detects installed AI IDEs and injects the HoloScript MCP
 * configurations. Uses safe JSON parsing/merging to preserve existing tools.
 */
export async function provisionMcpConfigs(apiKey: string): Promise<void> {
  const home = os.homedir();
  const appData =
    process.env.APPDATA ||
    (process.platform === 'darwin'
      ? path.join(home, 'Library', 'Application Support')
      : path.join(home, '.config'));

  // Define IDE configuration targets
  const targets = [
    {
      name: 'Claude Code / Desktop',
      file: path.join(home, '.mcp', 'config.json'),
    },
    {
      name: 'Cursor',
      file: path.join(
        appData,
        'Cursor',
        'User',
        'globalStorage',
        'rooveterinaryinc.roo-cline',
        'settings',
        'cline_mcp_settings.json'
      ), // Common path for Cline inside Cursor
    },
    {
      name: 'VS Code (Roo/Cline)',
      file: path.join(
        appData,
        'Code',
        'User',
        'globalStorage',
        'rooveterinaryinc.roo-cline',
        'settings',
        'cline_mcp_settings.json'
      ),
    },
    {
      name: 'Antigravity IDE',
      file: path.join(home, '.gemini', 'antigravity', 'mcp_config.json'),
    },
  ];

  const serversToInject = {
    'holoscript-mcp': {
      url: `https://mcp.holoscript.net/mcp?apiKey=${apiKey}`,
      transport: 'sse',
      headers: {
        Authorization: `Bearer ${apiKey}`,
      },
      description:
        'HoloScript MCP — 122 tools: parse, compile, render, browser, codebase analysis, self-improvement',
    },
    'absorb-service': {
      url: `https://absorb.holoscript.net/mcp?apiKey=${apiKey}`,
      transport: 'sse',
      headers: {
        Authorization: `Bearer ${apiKey}`,
      },
      description:
        'HoloScript Absorb — 20 tools: codebase scanning, knowledge graphs, GraphRAG queries, recursive improvement',
    },
  };

  let provisionedCount = 0;

  for (const target of targets) {
    try {
      if (fs.existsSync(target.file)) {
        console.log(`\x1b[36mFound ${target.name} configuration at ${target.file}\x1b[0m`);

        const raw = fs.readFileSync(target.file, 'utf-8');
        let config: any = {};
        try {
          config = JSON.parse(raw);
        } catch {
          console.warn(
            `\x1b[33mWarning: Failed to parse JSON in ${target.file}. Regenerating...\x1b[0m`
          );
        }

        if (!config.mcpServers) {
          config.mcpServers = {};
        }

        // Merge in the servers
        config.mcpServers = {
          ...config.mcpServers,
          ...serversToInject,
        };

        fs.writeFileSync(target.file, JSON.stringify(config, null, 2));
        console.log(`\x1b[32m✓ Provisioned HoloScript MCP for ${target.name}\x1b[0m\n`);
        provisionedCount++;
      } else {
        // Automatically create ~/.mcp/config.json if it doesn't exist
        if (target.name.includes('Claude')) {
          const dir = path.dirname(target.file);
          if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

          const config = {
            mcpServers: serversToInject,
          };
          fs.writeFileSync(target.file, JSON.stringify(config, null, 2));
          console.log(
            `\x1b[32m✓ Created and Provisioned global MCP config at ${target.file}\x1b[0m\n`
          );
          provisionedCount++;
        }
      }
    } catch (err: unknown) {
      console.error(
        `\x1b[31mFailed to provision ${target.name}: ${err instanceof Error ? err.message : String(err)}\x1b[0m`
      );
    }
  }

  if (provisionedCount > 0) {
    console.log(
      `\x1b[1m\x1b[32mSuccessfully provisioned HoloScript for ${provisionedCount} IDE(s)!\x1b[0m`
    );
    console.log('\x1b[2mPlease restart your IDE or refresh the MCP integration to connect.\x1b[0m');
  } else {
    console.log('\x1b[33mNo supported IDEs were found on this system.\x1b[0m');
  }
}
