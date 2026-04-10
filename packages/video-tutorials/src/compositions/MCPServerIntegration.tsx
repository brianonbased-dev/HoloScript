import React from 'react';
import { AbsoluteFill, Sequence, useVideoConfig } from 'remotion';
import { TitleCard } from '../components/TitleCard';
import { CodeStep } from '../components/CodeStep';

const STEPS = [
  {
    title: 'What is an MCP Server',
    description:
      'MCP (Model Context Protocol) skills are defined in SKILL.md files with a structured frontmatter block.',
    lines: [
      { content: '# SKILL.md — MCP skill definition', dim: true },
      { content: '---', highlight: true },
      { content: 'name: holoscript-language', annotation: 'skill identifier' },
      { content: 'version: 1.0.0' },
      { content: 'description: HoloScript language tools for Claude Code' },
      { content: '' },
      { content: 'allowed-tools:', highlight: true },
      { content: '  - brittney_scan_project' },
      { content: '  - generate_scene' },
      { content: '  - compile_target' },
      { content: '  - validate_syntax' },
      { content: '' },
      { content: 'server:', highlight: true },
      { content: '  command: node' },
      { content: "  args: ['dist/mcp-server.js']", annotation: 'entry point' },
      { content: '---', highlight: true },
    ],
  },
  {
    title: 'HoloScript Language Server',
    description:
      'The holoscript-language MCP server registers tools using the @modelcontextprotocol/sdk package.',
    lines: [
      {
        content: 'import { Server } from "@modelcontextprotocol/sdk/server/index.js"',
        highlight: true,
      },
      {
        content: 'import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js"',
      },
      { content: '' },
      { content: 'const server = new Server(', highlight: true },
      { content: "  { name: 'holoscript-language', version: '1.0.0' }," },
      { content: '  { capabilities: { tools: {} } },' },
      { content: ')' },
      { content: '' },
      {
        content: 'server.setRequestHandler(ListToolsRequestSchema, async () => ({',
        highlight: true,
      },
      { content: '  tools: [brittneyScanTool, generateSceneTool, compileTool],' },
      { content: '}))' },
      { content: '' },
      { content: 'const transport = new StdioServerTransport()', type: 'added' as const },
      {
        content: 'await server.connect(transport)',
        type: 'added' as const,
        annotation: 'start server',
      },
    ],
  },
  {
    title: 'Tool: brittney_scan_project',
    description:
      'Call the scan tool to discover all .holo files and their scene names in the workspace.',
    lines: [
      { content: '// MCP tool call — request', dim: true },
      { content: '{', highlight: true },
      { content: '  "server": "holoscript-language",' },
      { content: '  "tool": "brittney_scan_project",' },
      { content: '  "args": {' },
      { content: '    "workspacePath": "/Users/dev/my-xr-project",' },
      { content: '    "includeStats": true' },
      { content: '  }' },
      { content: '}' },
      { content: '' },
      { content: '// Response', dim: true },
      { content: '{', highlight: true },
      { content: '  "files": [', annotation: 'found .holo files' },
      { content: '    { "path": "scenes/Lobby.holo", "scenes": ["Lobby"] },' },
      { content: '    { "path": "scenes/Arena.holo", "scenes": ["Arena", "Spectator"] }' },
      { content: '  ],' },
      { content: '  "totalScenes": 3', type: 'added' as const },
      { content: '}' },
    ],
  },
  {
    title: 'Tool: generate_scene',
    description:
      'Pass a natural language prompt and receive a ready-to-use .holo scene from the MCP server.',
    lines: [
      { content: '// MCP tool call — generate_scene', dim: true },
      { content: '{', highlight: true },
      { content: '  "server": "holoscript-language",' },
      { content: '  "tool": "generate_scene",' },
      { content: '  "args": {' },
      {
        content:
          '    "prompt": "A futuristic showroom with neon lighting and a car on a rotating platform",',
      },
      { content: '    "targets": ["unity", "babylon"],' },
      { content: '    "style": "cyberpunk"', annotation: 'optional style hint' },
      { content: '  }' },
      { content: '}' },
      { content: '' },
      { content: '// Generated .holo scene returned in response.content', dim: true },
      { content: 'scene Showroom {', type: 'added' as const, highlight: true },
      { content: '  object Car { mesh: GLB { url: "car.glb" }', type: 'added' as const },
      { content: '    traits: [RotateY { speed: 0.5 }] }', type: 'added' as const },
      { content: '  light: NeonLight { color: #ff00aa, intensity: 3 }', type: 'added' as const },
      { content: '}', type: 'added' as const },
    ],
  },
  {
    title: 'Registering in Claude Settings',
    description:
      'Add the HoloScript MCP server to your .claude/settings.json so Claude Code can discover it automatically.',
    lines: [
      { content: '// .claude/settings.json', dim: true },
      { content: '{', highlight: true },
      { content: '  "mcpServers": {', highlight: true },
      { content: '    "holoscript-language": {', annotation: 'server name' },
      { content: '      "command": "node",' },
      { content: '      "args": ["./node_modules/@holoscript/mcp-server/dist/index.js"],' },
      { content: '      "env": {', type: 'added' as const },
      {
        content: '        "HOLOSCRIPT_WORKSPACE": "${workspaceFolder}"',
        type: 'added' as const,
        annotation: 'path injection',
      },
      { content: '      }', type: 'added' as const },
      { content: '    }' },
      { content: '  },' },
      { content: '  "permissions": {' },
      { content: '    "allow": ["holoscript-language:*"]' },
      { content: '  }' },
      { content: '}' },
    ],
  },
];

export const MCPServerIntegration: React.FC = () => {
  const { fps } = useVideoConfig();
  const titleDuration = 3 * fps;
  const stepDuration = 5 * fps;

  return (
    <AbsoluteFill style={{ background: '#0f1117' }}>
      <Sequence from={0} durationInFrames={titleDuration}>
        <TitleCard
          title="MCP Server Integration"
          subtitle="Extend Claude Code with HoloScript-aware tools using the Model Context Protocol"
          tag="Advanced"
        />
      </Sequence>

      {STEPS.map((step, i) => (
        <Sequence key={i} from={titleDuration + i * stepDuration} durationInFrames={stepDuration}>
          <CodeStep
            stepNumber={i + 1}
            title={step.title}
            description={step.description}
            lines={step.lines}
            language="typescript"
          />
        </Sequence>
      ))}
    </AbsoluteFill>
  );
};
