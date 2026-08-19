#!/usr/bin/env node
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const SCHEMA_VERSION = 'hololand.holoshell.holoscript-inclusion-inventory.v0.1.0';
const DEFAULT_OUTPUT = path.join('.tmp', 'holoshell', 'holoscript-inventory.json');
const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DEFAULT_HOLOSCRIPT_ROOT = path.resolve(REPO_ROOT, '..', 'HoloScript');

const SOURCE_ANCHORS = {
  appReadme: 'apps/holoshell/README.md',
  inventoryDoc: 'apps/holoshell/docs/HOLOSCRIPT_INCLUSION_INVENTORY.md',
  hScriptBridge: 'apps/holoshell/source/holoshell-holoscript-bridge.hsplus',
  shellWorld: 'apps/holoshell/source/holoshell-shell-world.holo',
};

const IGNORE_DIRS = new Set([
  '.git',
  '.next',
  '.turbo',
  'coverage',
  'dist',
  'build',
  'node_modules',
  'out',
]);

const TRAIT_CATEGORY_RULES = [
  ['host_legacy_bridge', /computer|native|sys|file|filesystem|browser|http|clipboard|keyboard|mouse|screen|window|os|ui[-_]?automation|capture|ocr/i],
  ['ui_2d_shell', /2d|native2d|semantic2d|ui|layout|panel|button|form|text|input|card|theme|responsive|canvas/i],
  ['visual_geometry_skin', /visual|shape|geometry|material|shader|particle|fluid|sdf|ray|gaussian|splat|hologram|light|post|vfx|terrain|portal/i],
  ['xr_spatial_runtime', /xr|vr|ar|vision|openxr|spatial|hand|gaze|anchor|quest|headset|pose/i],
  ['agent_agi_brittney', /agent|(?:^|[_-])ai(?:[_-]|$)|\bagi\b|brittney|llm|companion|npc|memory|emotion|goal|planner|cognitive|brain|persona/i],
  ['physics_simulation', /physics|collision|cloth|rope|soft|solver|structural|tet|fluid|molecular|simulation|dynamics|thermal|quantum/i],
  ['data_knowledge_absorb', /absorb|graph|rag|knowledge|search|vector|database|storage|dataset|index|semantic/i],
  ['coordination_mesh', /mesh|crdt|sync|network|room|message|pubsub|webrtc|collab|team|orchestration/i],
  ['governance_receipts', /receipt|trust|security|auth|permission|policy|compliance|audit|scope|token|identity|custody/i],
  ['economy_protocol', /economy|payment|x402|nft|market|wallet|protocol|token|commerce|bounty/i],
];

const KNOWN_GEOMETRIES = new Set([
  'box',
  'capsule',
  'cone',
  'cube',
  'cylinder',
  'ground',
  'orb',
  'plane',
  'pyramid',
  'ring',
  'sphere',
  'torus',
]);

function parseArgs(argv) {
  const args = {
    json: false,
    output: DEFAULT_OUTPUT,
    holoscriptRoot: process.env.HOLOSCRIPT_ROOT || DEFAULT_HOLOSCRIPT_ROOT,
    selfTest: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--json') args.json = true;
    else if (arg === '--output') args.output = argv[++index];
    else if (arg === '--holoscript-root') args.holoscriptRoot = argv[++index];
    else if (arg === '--self-test') args.selfTest = true;
    else if (arg === '--help' || arg === '-h') {
      printHelp();
      process.exit(0);
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  return args;
}

function printHelp() {
  console.log(`HoloShell HoloScript inclusion inventory

Usage:
  node scripts/holoshell-holoscript-inventory.mjs [options]

Options:
  --json                       Print inventory JSON.
  --output <path>              Write output path. Defaults to .tmp/holoshell/holoscript-inventory.json.
  --holoscript-root <path>     HoloScript repo root. Defaults to sibling ../HoloScript or HOLOSCRIPT_ROOT.
  --self-test                  Assert expected HoloScript surface families are present.
  -h, --help                   Show this help.
`);
}

function toPosix(value) {
  return String(value).replace(/\\/g, '/');
}

function relative(root, filePath) {
  return toPosix(path.relative(root, filePath));
}

function readText(filePath) {
  try {
    return readFileSync(filePath, 'utf8');
  } catch {
    return '';
  }
}

function listDirs(dirPath) {
  if (!existsSync(dirPath)) return [];
  return readdirSync(dirPath, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && !entry.name.startsWith('.') && entry.name !== 'node_modules')
    .map((entry) => entry.name)
    .sort();
}

function walkFiles(root, predicate = () => true) {
  if (!existsSync(root)) return [];
  const files = [];
  const stack = [root];

  while (stack.length > 0) {
    const current = stack.pop();
    let entries = [];
    try {
      entries = readdirSync(current, { withFileTypes: true });
    } catch {
      continue;
    }

    for (const entry of entries) {
      if (entry.name.toLowerCase() === 'nul') continue;
      const fullPath = path.join(current, entry.name);
      if (entry.isDirectory()) {
        if (!IGNORE_DIRS.has(entry.name)) stack.push(fullPath);
      } else if (entry.isFile() && predicate(fullPath, entry)) {
        files.push(fullPath);
      }
    }
  }

  return files.sort();
}

function uniqueSorted(values) {
  return [...new Set(values.filter(Boolean))].sort((a, b) => String(a).localeCompare(String(b)));
}

function extractQuotedValues(text) {
  return uniqueSorted([...text.matchAll(/['"`]([A-Za-z0-9_.:/@ -]+)['"`]/g)].map((match) => match[1]));
}

function extractArrayAfter(text, marker) {
  const start = text.indexOf(marker);
  if (start === -1) return [];
  const lineEnd = text.indexOf('\n', start);
  const assignment = text.indexOf('=', start);
  const property = text.indexOf(':', start);
  const equalsOnMarkerLine = assignment !== -1 && (lineEnd === -1 || assignment < lineEnd);
  const searchStart = equalsOnMarkerLine ? assignment : property !== -1 ? property : start;
  const open = text.indexOf('[', searchStart);
  if (open === -1) return [];

  let depth = 0;
  for (let index = open; index < text.length; index += 1) {
    const char = text[index];
    if (char === '[') depth += 1;
    else if (char === ']') {
      depth -= 1;
      if (depth === 0) return extractQuotedValues(text.slice(open + 1, index));
    }
  }

  return [];
}

function extractDefault2DTypes(text) {
  const start = text.indexOf('const defaults');
  if (start === -1) return [];
  const end = text.indexOf('};', start);
  const block = end === -1 ? text.slice(start) : text.slice(start, end);
  return uniqueSorted([...block.matchAll(/^\s*['"]?([A-Za-z][A-Za-z0-9-]*)['"]?:\s*\{/gm)].map((match) => match[1]));
}

function extractTraitHandlerNames(text) {
  const handlerNames = [
    ...text.matchAll(/\b[A-Za-z0-9_]*Handler[^=]*=\s*\{[\s\S]{0,260}?\bname:\s*['"`]([A-Za-z0-9_-]+)['"`]/g),
  ].map((match) => match[1]);
  return uniqueSorted(handlerNames);
}

function extractHoloDirectiveNames(text) {
  return uniqueSorted([...text.matchAll(/(?:^|\s)@([A-Za-z][A-Za-z0-9_-]*)/g)].map((match) => match[1]));
}

function extractCaseNames(text) {
  return uniqueSorted([...text.matchAll(/\bcase\s+['"`]([A-Za-z0-9_-]+)['"`]\s*:/g)].map((match) => match[1]));
}

function extractDialectDescriptors(text) {
  const descriptors = [];
  const descriptorRegex = /\{\s*name:\s*'([^']+)'[\s\S]*?domain:\s*'([^']+)'[\s\S]*?description:\s*(?:'([^']*)'|"([^"]*)"|`([^`]*)`|([\s\S]*?))[\s\S]*?supportedTraits:\s*\[([\s\S]*?)\][\s\S]*?riskTier:\s*'([^']+)'[\s\S]*?outputExtensions:\s*\[([\s\S]*?)\]/g;
  for (const match of text.matchAll(descriptorRegex)) {
    descriptors.push({
      name: match[1],
      domain: match[2],
      description: (match[3] || match[4] || match[5] || '').replace(/\s+/g, ' ').trim() || null,
      supportedTraits: extractQuotedValues(match[7]),
      riskTier: match[8],
      outputExtensions: extractQuotedValues(match[9]),
    });
  }
  return descriptors.sort((a, b) => a.name.localeCompare(b.name));
}

function groupBy(items, keyFn) {
  const groups = {};
  for (const item of items) {
    const key = keyFn(item);
    if (!groups[key]) groups[key] = [];
    groups[key].push(item);
  }
  return Object.fromEntries(Object.entries(groups).sort(([a], [b]) => a.localeCompare(b)));
}

function categorizeTrait(filePath, traitNames) {
  const haystack = `${path.basename(filePath)} ${traitNames.join(' ')}`;
  for (const [category, rule] of TRAIT_CATEGORY_RULES) {
    if (rule.test(haystack)) return category;
  }
  return 'platform_misc';
}

function extractTwoDSurface(root) {
  const parserPath = path.join(root, 'packages', 'core', 'src', 'HoloScript2DParser.ts');
  const nativeTraitsPath = path.join(root, 'packages', 'core', 'src', 'traits', 'Native2DTraits.ts');
  const semanticTraitsPath = path.join(root, 'packages', 'core', 'src', 'traits', 'v6', 'Semantic2DTraits.ts');
  const domRendererPath = path.join(root, 'packages', 'runtime', 'src', 'browser', 'DOM2DRenderer.ts');
  const nativeCompilerPath = path.join(root, 'packages', 'core', 'src', 'compiler', 'Native2DCompiler.ts');

  const parserText = readText(parserPath);
  const validElementTypes = extractArrayAfter(parserText, 'const validTypes');
  const defaultElementTypes = extractDefault2DTypes(parserText);
  const nativeTraitHandlers = extractTraitHandlerNames(readText(nativeTraitsPath));
  const semanticTraitHandlers = extractTraitHandlerNames(readText(semanticTraitsPath));
  const domCases = extractCaseNames(readText(domRendererPath));

  return {
    sourceFiles: {
      parser: relative(root, parserPath),
      nativeCompiler: relative(root, nativeCompilerPath),
      nativeTraits: relative(root, nativeTraitsPath),
      semanticTraits: relative(root, semanticTraitsPath),
      domRenderer: relative(root, domRendererPath),
      revolutionTemplate: 'packages/create-holoscript/templates/2d-revolution/src/scene.holo',
    },
    parser: {
      validElementTypes,
      defaultElementTypes,
      defaultTypesNotAcceptedByParser: defaultElementTypes.filter((type) => !validElementTypes.includes(type)),
      eventHandlers: extractArrayAfter(parserText, 'allowedEventHandlers'),
      voiceCommands: ['create <elementType> <name>', 'add <elementType> <name>'],
      gestureShortcuts: {
        tap: 'button',
        'double-tap': 'textinput',
        'long-press': 'panel',
      },
      securityLimits: {
        maxUIElements: Number(parserText.match(/maxUIElements:\s*(\d+)/)?.[1] || 0),
        maxNestingDepth: Number(parserText.match(/maxNestingDepth:\s*(\d+)/)?.[1] || 0),
        maxPropertyLength: Number(parserText.match(/maxPropertyLength:\s*(\d+)/)?.[1] || 0),
      },
    },
    native2D: {
      compilerFormats: ['html', 'react'],
      compilerOptions: ['useUIComponents', 'slots'],
      traitHandlers: nativeTraitHandlers,
    },
    semantic2D: {
      projections: ['flat-semantic', 'hybrid', 'immersive'],
      layoutFlows: ['semantic', 'priority', 'radial', 'cluster'],
      particleFeedbackModes: ['hover', 'intent', 'bounty', 'success', 'error'],
      particleFeedbackTypes: ['burst', 'ripple', 'swarm', 'spark'],
      traitHandlers: semanticTraitHandlers,
    },
    runtimeDomRenderer: {
      nodeMappings: domCases,
      extensionPoints: ['customCreators', 'onAction', 'classPrefix'],
    },
  };
}

function extractCompilerSurface(root) {
  const compilerRoot = path.join(root, 'packages', 'core', 'src', 'compiler');
  const compilerFiles = walkFiles(compilerRoot, (filePath) => filePath.endsWith('Compiler.ts'))
    .map((filePath) => relative(root, filePath));
  const dialectFile = path.join(compilerRoot, 'registerBuiltinDialects.ts');
  const dialects = extractDialectDescriptors(readText(dialectFile));
  const byDomain = groupBy(dialects, (dialect) => dialect.domain);

  return {
    compilerFileCount: compilerFiles.length,
    compilerFiles,
    dialects,
    dialectsByDomain: Object.fromEntries(
      Object.entries(byDomain).map(([domain, items]) => [
        domain,
        {
          count: items.length,
          names: items.map((item) => item.name).sort(),
        },
      ])
    ),
    sourceFiles: {
      registry: relative(root, dialectFile),
    },
  };
}

function extractVisualSurface(root) {
  const threePath = path.join(root, 'packages', 'core', 'src', 'compiler', 'ThreeJSCompiler.ts');
  const r3fPath = path.join(root, 'packages', 'core', 'src', 'compiler', 'R3FCompiler.ts');
  const puppetPath = path.join(root, 'packages', 'engine', 'src', 'rendering', 'headless', 'PuppeteerRenderer.ts');
  const r3fGeneratedTypes = path.join(root, 'packages', 'r3f-renderer', 'scripts', 'generate-types.mjs');
  const vfxPath = path.join(root, 'packages', 'r3f-renderer', 'src', 'components', 'VFXParticleRenderer.tsx');

  const threeCases = extractCaseNames(readText(threePath)).filter((name) => KNOWN_GEOMETRIES.has(name));
  const puppetCases = extractCaseNames(readText(puppetPath)).filter((name) => KNOWN_GEOMETRIES.has(name));
  const r3fCases = extractCaseNames(readText(r3fPath)).filter((name) => KNOWN_GEOMETRIES.has(name) || name === 'portal');
  const r3fTypeText = readText(r3fGeneratedTypes);
  const vfxText = readText(vfxPath);

  const draftShapeMatch = r3fTypeText.match(/export type DraftShape = ([^;]+);/);
  const draftShapes = draftShapeMatch ? extractQuotedValues(draftShapeMatch[1]) : [];
  const hologramRoutesMatch = r3fTypeText.match(/export type HologramRouteKind = ([^;]+);/);
  const hologramRoutes = hologramRoutesMatch ? extractQuotedValues(hologramRoutesMatch[1]) : [];
  const vfxPresetMatch = vfxText.match(/type VFXPreset = ([^;]+);/) || vfxText.match(/export type VFXPreset = ([^;]+);/);
  const vfxPresets = vfxPresetMatch ? extractQuotedValues(vfxPresetMatch[1]) : extractQuotedValues((vfxText.match(/const PRESETS:[\s\S]*?=\s*\{([\s\S]*?)\n\};/) || [])[1] || '');

  return {
    geometries: {
      threejsCompiler: threeCases,
      headlessRenderer: puppetCases,
      r3fCompiler: r3fCases,
      draftShapes,
    },
    highDensityRendering: [
      'React Three Fiber renderer',
      'Three.js compiler',
      'WebGPU compiler',
      'GPU splat sorting',
      'GPU instancing',
      'Shape pool rendering',
      'SDF and SDF ray marching compilers',
      'Gaussian splatting compiler/viewer',
      'Hologram worker quilt/MV-HEVC/parallax pipeline',
    ],
    skinAndEffectVocabulary: uniqueSorted([
      ...extractQuotedValues(readText(r3fPath)).filter((value) =>
        /hologram|water|ripple|wave|flow|glass|skin|portal|particle|spark|fluid|bloom|glow|fire|smoke|magic|rain|snow/i.test(value)
      ),
      ...vfxPresets,
    ]).slice(0, 120),
    mediaHologramRoutes: hologramRoutes,
    sourceFiles: {
      threejsCompiler: relative(root, threePath),
      r3fCompiler: relative(root, r3fPath),
      headlessRenderer: relative(root, puppetPath),
      r3fGeneratedTypes: relative(root, r3fGeneratedTypes),
      vfxParticleRenderer: relative(root, vfxPath),
    },
  };
}

function extractTraitSurface(root) {
  const traitsRoot = path.join(root, 'packages', 'core', 'src', 'traits');
  const files = walkFiles(traitsRoot, (filePath) => /\.(ts|holo|hs|hsplus)$/.test(filePath));
  const records = files.map((filePath) => {
    const text = readText(filePath);
    const traitNames = /\.(holo|hs|hsplus)$/.test(filePath)
      ? extractHoloDirectiveNames(text)
      : extractTraitHandlerNames(text);
    return {
      file: relative(root, filePath),
      category: categorizeTrait(filePath, traitNames),
      traitNames,
    };
  });
  const byCategory = groupBy(records, (record) => record.category);

  return {
    traitSourceFileCount: records.length,
    traitHandlerCount: records.reduce((sum, record) => sum + record.traitNames.length, 0),
    categories: Object.fromEntries(
      Object.entries(byCategory).map(([category, items]) => [
        category,
        {
          fileCount: items.length,
          traitCount: items.reduce((sum, item) => sum + item.traitNames.length, 0),
          sampleFiles: items.slice(0, 12).map((item) => item.file),
          sampleTraitNames: uniqueSorted(items.flatMap((item) => item.traitNames)).slice(0, 30),
        },
      ])
    ),
    files: records,
  };
}

function extractMcpSurface(root) {
  const mcpRoot = path.join(root, 'packages', 'mcp-server', 'src');
  const files = walkFiles(mcpRoot, (filePath) => /\.(ts|md|hs|hsplus|holo)$/.test(filePath))
    .filter((filePath) => !relative(root, filePath).includes('/__tests__/'));
  const compileToolNames = [];
  const likelyToolNames = [];
  for (const filePath of files) {
    const text = readText(filePath);
    for (const match of text.matchAll(/['"`](compile_to_[A-Za-z0-9_-]+)['"`]/g)) {
      compileToolNames.push(match[1]);
    }
    for (const match of text.matchAll(/\bname:\s*['"`]([A-Za-z0-9_.:-]+)['"`]/g)) {
      if (/^(holo|compile|absorb|agent|brittney|browser|render|simulate|validate|trait|holomesh|mcp|tool|protocol|audit|critic|founder|oracle|plugin|workspace|world|gltf|hologram|holomap|negotiation|network|service|snapshot|wisdom|secret)/i.test(match[1])) {
        likelyToolNames.push(match[1]);
      }
    }
  }

  const families = groupBy(
    files.map((filePath) => {
      const rel = relative(root, filePath);
      const base = path.basename(filePath);
      const family =
        rel.includes('/holomesh/') ? 'holomesh' :
        rel.includes('/browser/') ? 'browser' :
        rel.includes('/security/') || rel.includes('/auth/') ? 'security_auth' :
        rel.includes('/ops/') ? 'operations' :
        base.includes('hologram') ? 'hologram' :
        base.includes('compiler') || base.includes('renderer') ? 'compile_render' :
        base.includes('absorb') || base.includes('graph') ? 'absorb_graph' :
        base.includes('agent') || base.includes('brittney') ? 'agent_brittney' :
        base.includes('tool') ? 'tools_misc' :
        'platform_misc';
      return { file: rel, family };
    }),
    (record) => record.family
  );

  return {
    sourceFileCount: files.length,
    compileToolNames: uniqueSorted(compileToolNames),
    likelyToolNames: uniqueSorted(likelyToolNames).slice(0, 300),
    families: Object.fromEntries(
      Object.entries(families).map(([family, items]) => [
        family,
        {
          fileCount: items.length,
          sampleFiles: items.slice(0, 18).map((item) => item.file),
        },
      ])
    ),
  };
}

function extractPackageSurface(root) {
  const packageRoot = path.join(root, 'packages');
  const serviceRoot = path.join(root, 'services');
  const packageDirs = listDirs(packageRoot).filter((name) => existsSync(path.join(packageRoot, name, 'package.json')));
  const serviceDirs = listDirs(serviceRoot);

  return {
    packages: packageDirs.map((name) => {
      const pkg = JSON.parse(readText(path.join(packageRoot, name, 'package.json')) || '{}');
      return {
        name: pkg.name || name,
        dir: `packages/${name}`,
        description: pkg.description || null,
      };
    }),
    services: serviceDirs.map((name) => `services/${name}`),
  };
}

function makeHoloShellInclusionMap(inventory) {
  return [
    {
      id: 'legacy-ui-geometric-wrapper',
      displayName: 'Legacy UI geometric wrapper',
      shellMeaning: 'Turn live legacy windows into HoloScript object graphs, then render them as thousands of panels, glyphs, particles, and shape clusters.',
      includeNow: [
        'Native 2D compiler for HTML/React projections',
        'DOM2DRenderer for AST-to-DOM surfaces',
        'Semantic 2D traits for priority, intent, agent attention, live metrics, and particle feedback',
        'Three.js/R3F geometry vocabulary for reconstructing controls as spatial objects',
        'High-density GPU rendering, instancing, splats, SDF, and particles for non-legacy skins',
      ],
      bridgeNeeded: [
        'Host OS window/capture/accessibility-tree bridge that emits .holo/.hsplus graphs',
        'OCR/vision fallback for apps without accessible UI trees',
        'Action adapter that maps geometric shell gestures back into legacy app commands',
      ],
    },
    {
      id: 'liquid-os-skins',
      displayName: 'Liquid/fire/developer shell skins',
      shellMeaning: 'The desktop becomes a material world. Programs, files, browsers, and agents are bubbles or portals inside a live HoloScript skin.',
      includeNow: [
        'R3F animated materials and shader vocabulary',
        'VFX particles for fire, smoke, sparks, magic, rain, and snow',
        'Fluid, portal, hologram, bloom/glow, and procedural field traits',
        'Headless screenshot/prerender path for hardware-proven visual receipts',
      ],
      bridgeNeeded: [
        'Skin preset schema promoted to HoloScript so skins are source artifacts, not one-off CSS',
        'Renderer path optimized for thousands of shell nodes plus text labels',
      ],
    },
    {
      id: 'brittney-agi-presence',
      displayName: 'Brittney/AGI assistant presence',
      shellMeaning: 'Brittney is not a dashboard widget. She is the assistant layer that sees shell state, explains risk, launches agents, and manipulates the world with receipts.',
      includeNow: [
        'Agent, companion, LLM, memory, attention, orchestration, and HoloMesh tool families',
        'Semantic 2D agent_attention and intent_driven traits',
        'Receipt, custody, policy, and team-room infrastructure',
      ],
      bridgeNeeded: [
        'Assistant contract for local screen/context perception with strict permission envelopes',
        'Visible action receipt stream that can collapse into the world background',
      ],
    },
    {
      id: 'program-file-browser-bubbles',
      displayName: 'Programs/files/browser bubbles',
      shellMeaning: 'Every app, file, URL, team room, and agent gets a source-backed object with launch, preview, transform, and receipt behavior.',
      includeNow: [
        'File/browser/http/native-call/system IO trait families where present',
        'HoloScript package, CLI, MCP, and service surfaces',
        'Absorb/GraphRAG/codebase intelligence for projects and documents',
      ],
      bridgeNeeded: [
        'Canonical shell-object schema for app/file/browser/agent objects',
        'Per-object permission envelopes and reversible launch/action receipts',
      ],
    },
    {
      id: 'cross-platform-hololand',
      displayName: 'HoloLand deployment targets',
      shellMeaning: 'HoloShell should author once in HoloScript and project to desktop web, mobile, VR/AR, game engines, services, and hologram media.',
      includeNow: [
        `${inventory.compilerSurface.dialects.length} registered compiler dialects`,
        'Web3D, XR, mobile, runtime shader, robotics/IoT, service, game engine, and native-2D targets',
        'Hologram image/GIF/video/quilt/MV-HEVC/parallax routes',
      ],
      bridgeNeeded: [
        'Target-specific shell capability matrix so unsupported features gracefully degrade',
        'Automated compile/prerender checks per shell skin and target',
      ],
    },
  ];
}

function createInventory(args) {
  const root = path.resolve(args.holoscriptRoot);
  if (!existsSync(root)) throw new Error(`HoloScript root not found: ${root}`);

  const packageSurface = extractPackageSurface(root);
  const compilerSurface = extractCompilerSurface(root);
  const twoDSurface = extractTwoDSurface(root);
  const visualSurface = extractVisualSurface(root);
  const traitSurface = extractTraitSurface(root);
  const mcpSurface = extractMcpSurface(root);

  const inventory = {
    schemaVersion: SCHEMA_VERSION,
    generatedAt: new Date().toISOString(),
    sourceAnchors: SOURCE_ANCHORS,
    source: {
      holoscriptRoot: root,
      hololandRoot: REPO_ROOT,
    },
    summary: {
      packageCount: packageSurface.packages.length,
      serviceCount: packageSurface.services.length,
      compilerFileCount: compilerSurface.compilerFileCount,
      dialectCount: compilerSurface.dialects.length,
      traitSourceFileCount: traitSurface.traitSourceFileCount,
      traitHandlerCount: traitSurface.traitHandlerCount,
      mcpSourceFileCount: mcpSurface.sourceFileCount,
      mcpCompileToolNameCount: mcpSurface.compileToolNames.length,
      twoDParserElementTypeCount: twoDSurface.parser.validElementTypes.length,
      native2DTraitCount: twoDSurface.native2D.traitHandlers.length,
      semantic2DTraitCount: twoDSurface.semantic2D.traitHandlers.length,
      threejsGeometryCount: visualSurface.geometries.threejsCompiler.length,
      headlessGeometryCount: visualSurface.geometries.headlessRenderer.length,
    },
    packageSurface,
    compilerSurface,
    twoDSurface,
    visualSurface,
    traitSurface,
    mcpSurface,
  };

  return {
    ...inventory,
    holoshellInclusionMap: makeHoloShellInclusionMap(inventory),
    inventoryFindings: [
      {
        id: '2d-parser-defaults-exceed-valid-types',
        severity: twoDSurface.parser.defaultTypesNotAcceptedByParser.length > 0 ? 'medium' : 'info',
        finding: 'HoloScript2DParser defines default properties for more UI types than the validator accepts.',
        evidence: twoDSurface.parser.defaultTypesNotAcceptedByParser,
        holoshellImpact: 'Dashboard/card/metric/row/col are promising for shell reconstruction, but should be promoted or handled through Native2D traits before HoloShell relies on parser acceptance.',
      },
      {
        id: 'geometry-renderer-split',
        severity: 'medium',
        finding: 'The Three.js/R3F vocabulary is broader than the headless renderer vocabulary.',
        evidence: {
          threejsOnly: visualSurface.geometries.threejsCompiler.filter(
            (name) => !visualSurface.geometries.headlessRenderer.includes(name)
          ),
        },
        holoshellImpact: 'Use R3F/Three.js for the live shell and reserve headless screenshots for proven slices until text/icons/thousands-of-shapes rendering catches up.',
      },
      {
        id: 'os-ui-capture-bridge-missing-as-source',
        severity: 'high',
        finding: 'The HoloScript repo has browser/native/system/file-style surfaces, but no single canonical OS window/accessibility/OCR bridge that emits shell-ready .holo graphs.',
        evidence: ['Need Windows/macOS/Android window enumeration', 'Need accessibility tree capture', 'Need screenshot/OCR fallback', 'Need gesture-to-legacy-command adapter'],
        holoshellImpact: 'This is the next real HoloShell platform primitive for wrapping legacy UI instead of showing backend dashboards.',
      },
    ],
  };
}

function writeInventory(inventory, outputPath) {
  const resolved = path.resolve(REPO_ROOT, outputPath);
  mkdirSync(path.dirname(resolved), { recursive: true });
  writeFileSync(resolved, `${JSON.stringify(inventory, null, 2)}\n`, 'utf8');
  return resolved;
}

function assertSelfTest(inventory) {
  const failures = [];
  if (inventory.schemaVersion !== SCHEMA_VERSION) failures.push('schemaVersion mismatch');
  if (inventory.summary.dialectCount < 20) failures.push('expected at least 20 compiler dialects');
  if (inventory.summary.compilerFileCount < 30) failures.push('expected at least 30 compiler files');
  if (inventory.summary.traitSourceFileCount < 40) failures.push('expected at least 40 trait source files');
  if (inventory.summary.twoDParserElementTypeCount < 10) failures.push('expected HoloScript 2D parser element types');
  if (inventory.summary.native2DTraitCount < 10) failures.push('expected native 2D trait handlers');
  if (inventory.summary.semantic2DTraitCount < 8) failures.push('expected semantic 2D trait handlers');
  if (!inventory.holoshellInclusionMap.some((item) => item.id === 'legacy-ui-geometric-wrapper')) {
    failures.push('missing legacy UI geometric wrapper inclusion map');
  }
  if (!inventory.inventoryFindings.some((item) => item.id === 'os-ui-capture-bridge-missing-as-source')) {
    failures.push('missing OS UI bridge finding');
  }
  if (failures.length) {
    throw new Error(`Self-test failed:\n- ${failures.join('\n- ')}`);
  }
}

try {
  const args = parseArgs(process.argv.slice(2));
  const inventory = createInventory(args);
  const outputPath = writeInventory(inventory, args.output);
  if (args.selfTest) assertSelfTest(inventory);

  if (args.json) {
    console.log(JSON.stringify(inventory, null, 2));
  } else {
    console.log(`HoloShell HoloScript inventory: ${outputPath}`);
    console.log(`Packages/services: ${inventory.summary.packageCount}/${inventory.summary.serviceCount}`);
    console.log(`Compilers/dialects: ${inventory.summary.compilerFileCount}/${inventory.summary.dialectCount}`);
    console.log(`Traits: ${inventory.summary.traitHandlerCount} handlers across ${inventory.summary.traitSourceFileCount} files`);
    console.log(`2D: ${inventory.summary.twoDParserElementTypeCount} parser elements, ${inventory.summary.native2DTraitCount} native traits, ${inventory.summary.semantic2DTraitCount} semantic traits`);
    console.log(`Visual geometries: ${inventory.summary.threejsGeometryCount} Three.js, ${inventory.summary.headlessGeometryCount} headless`);
  }
} catch (error) {
  console.error(`holoshell-holoscript-inventory failed: ${error.message}`);
  process.exit(1);
}
