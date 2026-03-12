import { defineConfig } from 'vitepress';

export default defineConfig({
  title: 'HoloScript',
  description:
    'Open spatial computing platform — 3 languages, 30+ compile targets, AI agent runtime, visual studio, and 58+ packages',

  // Ignore dead links in excluded dev notes and cross-repo references
  ignoreDeadLinks: true,

  // Exclude legacy dev notes and directories not part of user-facing docs
  srcExclude: [
    'knowledge/**', // legacy - content migrated to language/ section
    '_archive/**', // dev notes archived from root
    'planning/**', // sprint planning notes
    'research/**', // research notes
    'archive/**', // old migration docs
    'integration/**', // old UPPERCASE integration files (replaced by integrations/)
    'graphics/**', // graphics dev notes
    'getting-started/**', // old directory (replaced by guides/)
    'ecosystem/**', // ecosystem dev notes
    // Root-level UPPERCASE dev note files
    'PLUGIN_SYSTEM_V2_DESIGN.md',
    'SPREAD_OPERATOR_IMPLEMENTATION.md',
    'NETWORKED_TRAIT_INTEGRATION_GUIDE.md',
    'NETWORKED_TRAIT_WEBSOCKET_PHASE_SUMMARY.md',
    'AGENT_API_REFERENCE.md',
    'QUICK_REFERENCE_CARD.md',
    'NAVIGATION_GUIDE.md',
    'DELIVERABLES_INDEX.md',
    'EXECUTIVE_SUMMARY.md',
    'TRAIT_EXTENSION_GUIDE.md',
    'PLUGIN_STATUS.md',
    'PARSER_FIX_PLAN.md',
    'ECOSYSTEM_INTEGRATION_PLAN.md',
    'GROK_X_INTEGRATION_ROADMAP.md',
    // Legacy guides (session/phase notes, not user docs)
    'guides/PHASE_1_2_IMPLEMENTATION_GUIDE.md',
    'guides/PHASE_3_DSL_TRAITS.md',
    'guides/PHASE_5_PERFORMANCE.md',
    'guides/PHASE_6_UI_COMPONENTS_GUIDE.md',
    'guides/PHASES_3_5_IMPLEMENTATION_GUIDE.md',
    'guides/README_PHASES_3_5.md',
    'guides/PLATFORM_COMPILERS.md',
    'guides/FEATURE_MIGRATION.md',
    // Legacy API docs (TypeDoc generates docs/api/ — these are hand-written stubs)
    'api/CLI.md',
    'api/CORE_API.md',
    'api/OVERVIEW.md',
    // Old academy readme
    'academy/README.md',
    // Docs root README (legacy dev notes, homepage is index.md)
    'README.md',
  ],

  head: [
    ['link', { rel: 'icon', href: '/logo.svg' }],
    ['meta', { name: 'theme-color', content: '#00ffff' }],
    ['meta', { property: 'og:type', content: 'website' }],
    ['meta', { property: 'og:url', content: 'https://holoscript.net' }],
    [
      'meta',
      { property: 'og:title', content: 'HoloScript - The Open Platform for Spatial Worlds' },
    ],
    [
      'meta',
      {
        property: 'og:description',
        content:
          'Create with AI. Own what you build. Ship everywhere. Open platform for spatial worlds — interactive 3D, AI agents, open marketplace. Works with Unity, Unreal, WebGPU, and 20+ more.',
      },
    ],
    ['meta', { property: 'og:image', content: 'https://holoscript.net/og-image.png' }],
    ['meta', { name: 'twitter:card', content: 'summary_large_image' }],
    ['meta', { name: 'twitter:site', content: '@holoscript' }],
    [
      'meta',
      { name: 'twitter:title', content: 'HoloScript - The Open Platform for Spatial Worlds' },
    ],
    [
      'meta',
      {
        name: 'twitter:description',
        content:
          'Create with AI. Own what you build. Ship everywhere. Open platform for spatial worlds — AI agents, marketplace, 25+ compile targets.',
      },
    ],
    ['meta', { name: 'twitter:image', content: 'https://holoscript.net/og-image.png' }],

    // Security Headers (via meta tags for GitHub Pages)
    [
      'meta',
      {
        'http-equiv': 'Content-Security-Policy',
        content:
          "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; font-src 'self' data:; connect-src 'self' https:; frame-ancestors 'none';",
      },
    ],
    ['meta', { 'http-equiv': 'X-Content-Type-Options', content: 'nosniff' }],
    ['meta', { 'http-equiv': 'X-Frame-Options', content: 'DENY' }],
    ['meta', { 'http-equiv': 'Referrer-Policy', content: 'strict-origin-when-cross-origin' }],
    [
      'meta',
      { 'http-equiv': 'Permissions-Policy', content: 'geolocation=(), microphone=(), camera=()' },
    ],

    // Remove version disclosure
    ['meta', { name: 'generator', content: 'VitePress' }],
  ],

  themeConfig: {
    logo: '/logo.svg',

    nav: [
      { text: 'Guide', link: '/guides/' },
      {
        text: 'Learn',
        items: [
          { text: 'Academy (Beginner)', link: '/academy/' },
          { text: 'Cookbook (Recipes)', link: '/cookbook/' },
          { text: 'Quick Start', link: '/guides/quick-start' },
        ],
      },
      {
        text: 'Reference',
        items: [
          { text: 'Language Reference', link: '/language/reference' },
          { text: 'Traits (2,000+)', link: '/traits/' },
          { text: 'Compilers (30+ targets)', link: '/compilers/' },
          { text: 'Agents', link: '/agents/' },
          { text: 'API Reference', link: '/api/' },
          { text: 'Language Spec', link: '/language/holoscript-language-spec' },
        ],
      },
      { text: 'Examples', link: '/examples/' },
      {
        text: 'Studio',
        link: 'https://studio.holoscript.net',
      },
      {
        text: 'Tools',
        items: [
          {
            text: 'Studio (AI Scene Builder)',
            link: 'https://studio.holoscript.net',
          },
          {
            text: 'VS Code Extension',
            link: 'https://marketplace.visualstudio.com/items?itemName=holoscript.holoscript-vscode',
          },
          { text: 'MCP Server', link: '/guides/mcp-server' },
          { text: 'Integrations', link: '/integrations/' },
        ],
      },
    ],

    sidebar: {
      '/guides/': [
        {
          text: 'Getting Started',
          items: [
            { text: 'Introduction', link: '/guides/' },
            { text: 'Quick Start', link: '/guides/quick-start' },
            { text: 'Installation', link: '/guides/installation' },
          ],
        },
        {
          text: 'Core Concepts',
          items: [
            { text: 'File Formats', link: '/guides/file-formats' },
            { text: 'Objects & Orbs', link: '/guides/objects' },
            { text: 'VR Traits', link: '/guides/traits' },
            { text: 'Compositions', link: '/guides/compositions' },
          ],
        },
        {
          text: 'Development',
          items: [
            { text: 'Best Practices', link: '/guides/best-practices' },
            { text: 'Troubleshooting', link: '/guides/troubleshooting' },
            { text: 'Python Bindings', link: '/guides/python-bindings' },
          ],
        },
        {
          text: 'Integration',
          items: [
            { text: 'VS Code', link: '/guides/vscode' },
            { text: 'MCP Server', link: '/guides/mcp-server' },
            { text: 'AI Agents', link: '/guides/ai-agents' },
          ],
        },
        {
          text: 'Codebase Intelligence',
          items: [
            { text: 'absorb & query', link: '/guides/codebase-intelligence' },
          ],
        },
      ],

      '/academy/': [
        {
          text: 'Level 1: Fundamentals',
          collapsed: false,
          items: [
            { text: 'Academy Overview', link: '/academy/' },
            {
              text: '1. What is HoloScript?',
              link: '/academy/level-1-fundamentals/01-what-is-holoscript',
            },
            { text: '2. Installation', link: '/academy/level-1-fundamentals/02-installation' },
            { text: '3. First Scene', link: '/academy/level-1-fundamentals/03-first-scene' },
            {
              text: '4. Compositions',
              link: '/academy/level-1-fundamentals/04-understanding-compositions',
            },
            { text: '5. Properties', link: '/academy/level-1-fundamentals/05-properties' },
            { text: '6. Traits Intro', link: '/academy/level-1-fundamentals/06-traits-intro' },
            { text: '7. Interactivity', link: '/academy/level-1-fundamentals/07-interactivity' },
            { text: '8. Templates', link: '/academy/level-1-fundamentals/08-templates' },
            {
              text: '9. Project Structure',
              link: '/academy/level-1-fundamentals/09-project-structure',
            },
            { text: '10. Building', link: '/academy/level-1-fundamentals/10-building' },
          ],
        },
        {
          text: 'Level 2: Intermediate',
          collapsed: true,
          items: [
            { text: 'Level 2 Overview', link: '/academy/level-2-intermediate/' },
            {
              text: '1. Advanced Traits',
              link: '/academy/level-2-intermediate/01-advanced-traits',
            },
            { text: '2. Physics Deep Dive', link: '/academy/level-2-intermediate/02-physics' },
            { text: '7. Networking', link: '/academy/level-2-intermediate/07-networking' },
            { text: '8. State Machines', link: '/academy/level-2-intermediate/08-state-machines' },
            {
              text: '9. NPCs & Behaviors',
              link: '/academy/level-2-intermediate/09-npc-and-behaviors',
            },
            {
              text: '10. Biome Encounters',
              link: '/academy/level-2-intermediate/10-biome-encounters',
            },
            {
              text: '11. Publishing to HoloHub',
              link: '/academy/level-2-intermediate/11-publishing-holohub',
            },
            {
              text: '12. Spatial Discovery',
              link: '/academy/level-2-intermediate/12-spatial-discovery',
            },
            {
              text: '13. Coordination Layer',
              link: '/academy/level-2-intermediate/13-coordination-layer',
            },
          ],
        },
        {
          text: 'Level 3: Advanced',
          collapsed: true,
          items: [
            { text: 'Level 3 Overview', link: '/academy/level-3-advanced/' },
            { text: '1. Custom Traits', link: '/academy/level-3-advanced/01-custom-traits' },
            { text: '4. Procedural Generation', link: '/academy/level-3-advanced/04-procedural' },
            {
              text: '5. Agent Choreography',
              link: '/academy/level-3-advanced/05-agent-choreography',
            },
            {
              text: '6. Agent Communication',
              link: '/academy/level-3-advanced/06-agent-communication',
            },
            { text: '7. Spatial Context', link: '/academy/level-3-advanced/07-spatial-context' },
            { text: '8. Consensus Systems', link: '/academy/level-3-advanced/08-consensus' },
          ],
        },
      ],

      '/traits/': [
        {
          text: 'Traits Overview',
          items: [
            { text: 'All Categories', link: '/traits/' },
            { text: 'Extending Traits', link: '/traits/extending' },
          ],
        },
        {
          text: 'Interaction & Input',
          items: [
            { text: 'Interaction', link: '/traits/interaction' },
            { text: 'Accessibility', link: '/traits/accessibility' },
          ],
        },
        {
          text: 'Physics & Environment',
          items: [
            { text: 'Physics', link: '/traits/physics' },
            { text: 'AR/Spatial', link: '/traits/spatial' },
          ],
        },
        {
          text: 'AI & Behavior',
          items: [
            { text: 'AI & Behavior', link: '/traits/ai-behavior' },
            { text: 'AI Autonomous', link: '/traits/ai-autonomous' },
          ],
        },
        {
          text: 'Media & Visual',
          items: [
            { text: 'Visual', link: '/traits/visual' },
            { text: 'Audio', link: '/traits/audio' },
            { text: 'Media', link: '/traits/media' },
          ],
        },
        {
          text: 'Connectivity',
          items: [
            { text: 'Social/Multiplayer', link: '/traits/social' },
            { text: 'Web3/Blockchain', link: '/traits/web3' },
            { text: 'IoT/Integration', link: '/traits/iot' },
          ],
        },
        {
          text: 'Advanced',
          items: [{ text: 'Advanced Traits', link: '/traits/advanced' }],
        },
        {
          text: 'Economics & Web3',
          items: [{ text: 'Economics / Web3', link: '/traits/economics' }],
        },
        {
          text: 'Security',
          items: [{ text: 'Security / ZK', link: '/traits/security' }],
        },
        {
          text: 'AI Generation',
          items: [{ text: 'AI Generation', link: '/traits/ai-generation' }],
        },
        {
          text: 'Human-in-the-Loop',
          items: [{ text: 'HITL', link: '/traits/hitl' }],
        },
      ],

      '/compilers/': [
        {
          text: 'Overview',
          items: [{ text: 'All 30+ Targets', link: '/compilers/' }],
        },
        {
          text: 'Game Engines',
          items: [
            { text: 'Unity', link: '/compilers/unity' },
            { text: 'Unreal Engine', link: '/compilers/unreal' },
            { text: 'Godot', link: '/compilers/godot' },
            { text: 'VRChat', link: '/compilers/vrchat' },
          ],
        },
        {
          text: 'Web & Browser',
          items: [
            { text: 'WebGPU', link: '/compilers/webgpu' },
            { text: 'Babylon.js', link: '/compilers/babylon' },
            { text: 'Three.js', link: '/compilers/three-js' },
            { text: 'PlayCanvas', link: '/compilers/playcanvas' },
            { text: 'WebAssembly', link: '/compilers/wasm' },
            { text: 'AR (WebXR)', link: '/compilers/ar' },
          ],
        },
        {
          text: 'Mobile & XR',
          items: [
            { text: 'iOS (ARKit)', link: '/compilers/ios' },
            { text: 'visionOS', link: '/compilers/vision-os' },
            { text: 'Android (ARCore)', link: '/compilers/android' },
            { text: 'Android XR', link: '/compilers/android-xr' },
            { text: 'OpenXR', link: '/compilers/openxr' },
            { text: 'OpenXR Spatial Entities', link: '/compilers/openxr-spatial' },
            { text: 'USD Physics', link: '/compilers/usd-physics' },
            { text: 'AI Glasses', link: '/compilers/ai-glasses' },
            { text: 'VR Reality (Digital Twins)', link: '/compilers/vr-reality' },
          ],
        },
        {
          text: 'Robotics',
          items: [
            { text: 'URDF (ROS 2)', link: '/compilers/robotics/urdf' },
            { text: 'SDF (Gazebo)', link: '/compilers/robotics/sdf' },
          ],
        },
        {
          text: 'IoT & Digital Twins',
          items: [
            { text: 'DTDL (Azure)', link: '/compilers/iot/dtdl' },
            { text: 'WoT (W3C)', link: '/compilers/iot/wot' },
          ],
        },
        {
          text: 'GPU & Shaders',
          items: [
            { text: 'Trait Shader Language (TSL)', link: '/compilers/tsl' },
          ],
        },
        {
          text: 'AI & Agents',
          items: [
            { text: 'A2A Agent Cards', link: '/compilers/a2a' },
            { text: 'Structural Causal Models', link: '/compilers/scm' },
            { text: 'Neuromorphic (NIR)', link: '/compilers/neuromorphic' },
          ],
        },
        {
          text: 'Web3',
          items: [
            { text: 'NFT Marketplace', link: '/compilers/nft-marketplace' },
          ],
        },
        {
          text: 'Guides',
          items: [
            { text: 'VRChat + Unity Workflow', link: '/compilers/vrchat-unity-workflow' },
            { text: 'VRChat Optimization', link: '/compilers/vrchat-optimization' },
          ],
        },
      ],

      '/agents/': [
        {
          text: 'Agent Framework',
          items: [
            { text: 'Overview', link: '/agents/' },
            { text: 'uAA2++ Protocol', link: '/agents/uaa2-protocol' },
            { text: 'UAAL VM', link: '/agents/uaal-vm' },
          ],
        },
      ],

      '/integrations/': [
        {
          text: 'Integrations',
          items: [
            { text: 'Overview', link: '/integrations/' },
            { text: 'Hololand Platform', link: '/integrations/hololand' },
            { text: 'Grok / X AI', link: '/integrations/grok' },
            { text: 'AI Architecture', link: '/integrations/ai-architecture' },
            { text: 'AI Use Cases', link: '/integrations/ai-use-cases' },
            { text: 'Interoperability', link: '/integrations/interoperability' },
          ],
        },
      ],

      '/cookbook/': [
        {
          text: 'Recipes',
          items: [
            { text: 'VR World with Physics', link: '/cookbook/vr-world-with-physics' },
            { text: 'Robotics Export Pipeline', link: '/cookbook/robotics-export-pipeline' },
            { text: 'AI Generated World', link: '/cookbook/ai-generated-world' },
            { text: 'Multi-Agent Choreography', link: '/cookbook/multi-agent-choreography' },
          ],
        },
      ],

      '/language/': [
        {
          text: 'Language Reference',
          items: [
            { text: 'Overview', link: '/language/reference' },
            { text: 'Language Spec', link: '/language/holoscript-language-spec' },
            { text: 'Syntax Extensions', link: '/language/syntax-extensions' },
          ],
        },
        {
          text: 'Basic Syntax (.hs)',
          collapsed: false,
          items: [{ text: 'Basic Objects', link: '/language/reference-hs-basic' }],
        },
        {
          text: 'Extended Syntax (.hsplus)',
          collapsed: false,
          items: [
            { text: 'Templates & Decorators', link: '/language/reference-hsplus-templates' },
            { text: 'State & Actions', link: '/language/reference-hsplus-state' },
            { text: 'Event Handlers', link: '/language/reference-hsplus-events' },
            { text: 'Modules & Imports', link: '/language/reference-hsplus-modules' },
          ],
        },
        {
          text: 'Advanced Compositions (.holo)',
          collapsed: false,
          items: [
            { text: 'Entity-Trait Pattern', link: '/language/reference-holo-entity' },
            { text: 'Object-Template Pattern', link: '/language/reference-holo-object' },
          ],
        },
        {
          text: 'Cross-Format Comparisons',
          collapsed: false,
          items: [
            { text: 'Simple VR Scene', link: '/language/comparison-simple-scene' },
            { text: 'Interactive Game', link: '/language/comparison-interactive-game' },
          ],
        },
      ],

      '/api/': [
        {
          text: 'API Reference',
          items: [
            { text: 'Syntax', link: '/api/' },
            { text: 'Traits', link: '/api/traits' },
            { text: 'Functions', link: '/api/functions' },
            { text: 'Limits', link: '/api/limits' },
          ],
        },
      ],

      '/examples/': [
        {
          text: 'Examples',
          items: [
            { text: 'Overview', link: '/examples/' },
            { text: 'Hello World', link: '/examples/hello-world' },
            { text: 'Arena Game', link: '/examples/arena-game' },
            { text: 'World Builder', link: '/examples/world-builder' },
          ],
        },
      ],
    },

    socialLinks: [{ icon: 'github', link: 'https://github.com/brianonbased-dev/Holoscript' }],

    footer: {
      message: 'Released under the MIT License.',
      copyright: 'Copyright © 2024-2026 Hololand',
    },

    search: {
      provider: 'local',
    },

    editLink: {
      pattern: 'https://github.com/brianonbased-dev/Holoscript/edit/master/docs/:path',
      text: 'Edit this page on GitHub',
    },
  },
});
