/**
 * CLI argument parsing
 */

export type RuntimeProfileName = 'headless' | 'minimal' | 'standard' | 'vr';

export type EdgePlatform = 'linux-arm64' | 'linux-x64' | 'windows-x64' | 'wasm';

export type ExportFormat = 'gltf' | 'glb' | 'usdz' | 'babylon' | 'unity' | 'unreal';

export type ImportSource = 'unity' | 'godot' | 'gltf';

export interface CLIOptions {
  command:
    | 'parse'
    | 'validate'
    | 'run'
    | 'ast'
    | 'repl'
    | 'watch'
    | 'compile'
    | 'build'
    | 'add'
    | 'remove'
    | 'list'
    | 'traits'
    | 'suggest'
    | 'generate'
    | 'templates'
    | 'pack'
    | 'unpack'
    | 'inspect'
    | 'diff'
    | 'wot-export'
    | 'headless'
    | 'package'
    | 'deploy'
    | 'monitor'
    | 'publish'
    | 'login'
    | 'logout'
    | 'whoami'
    | 'access'
    | 'org'
    | 'token'
    | 'export'
    | 'import'
    | 'visualize'
    | 'screenshot'
    | 'prerender'
    | 'pdf'
    | 'absorb'
    | 'self-improve'
    | 'help'
    | 'version';
  input?: string;
  output?: string;
  verbose: boolean;
  json: boolean;
  maxDepth: number;
  timeout: number;
  showAST: boolean;
  packages: string[];
  dev: boolean;
  /** Number of self-improvement cycles (default: 5) */
  cycles?: number;
  /** Enable JSONL training data capture for self-improve */
  harvest?: boolean;
  /** Auto-commit passing tests during self-improve */
  autoCommit?: boolean;
  /** Continuous daemon mode for self-improve */
  daemonMode?: boolean;
  /** Maximum consecutive failures before aborting self-improve (default: 3) */
  maxFailures?: number;
  description?: string;
  brittneyUrl?: string;
  target?: string;
  watch: boolean;
  split: boolean;
  /** Runtime profile (headless, minimal, standard, vr) */
  profile?: RuntimeProfileName;
  /** Tick rate for headless runtime (Hz) */
  tickRate?: number;
  /** Duration to run headless runtime (ms), 0 = indefinite */
  duration?: number;
  /** Edge deployment platform */
  platform?: EdgePlatform;
  /** Remote host for deploy/monitor */
  host?: string;
  /** SSH username for deploy */
  username?: string;
  /** SSH key path for deploy */
  keyPath?: string;
  /** SSH port for deploy */
  port?: number;
  /** Remote path for deploy */
  remotePath?: string;
  /** Service name for deploy */
  serviceName?: string;
  /** Dashboard mode for monitor */
  dashboard?: boolean;
  /** Refresh interval for monitor (ms) */
  interval?: number;
  /** Dry run mode for publish */
  dryRun?: boolean;
  /** Force publish even with warnings */
  force?: boolean;
  /** Registry URL for publish */
  registry?: string;
  /** Authentication token */
  authToken?: string;
  /** Version tag for publish (e.g., "latest", "beta") */
  tag?: string;
  /** Access level for publish */
  access?: 'public' | 'restricted';
  /** OTP code for 2FA */
  otp?: string;
  /** Subcommand for access/org/token commands */
  subcommand?: string;
  /** Role for org commands */
  role?: 'owner' | 'admin' | 'member';
  /** Permission level for access commands */
  permission?: 'read' | 'write' | 'admin';
  /** Token name */
  tokenName?: string;
  /** Read-only token flag */
  readonly?: boolean;
  /** Scopes for token */
  scopes?: string[];
  /** Expiration in days for token */
  expiresInDays?: number;
  /** Export format for export command */
  exportFormat?: ExportFormat;
  /** Pretty-print output (for gltf export) */
  prettyPrint?: boolean;
  /** Enable Draco compression (for gltf/glb export) */
  dracoCompression?: boolean;
  /** Import source format for import command */
  importSource?: ImportSource;
  /** Scene name override for import */
  sceneName?: string;
  /** Screenshot/render width */
  width?: number;
  /** Screenshot/render height */
  height?: number;
  /** Screenshot format (png, jpeg, webp) */
  imageFormat?: 'png' | 'jpeg' | 'webp';
  /** Image quality (0-100) for jpeg/webp */
  quality?: number;
  /** Device scale factor for retina screenshots */
  scale?: number;
  /** Wait time for scene to stabilize (ms) */
  waitFor?: number;
  /** PDF page format */
  pageFormat?: 'A4' | 'Letter' | 'Legal' | 'Tabloid' | 'A3' | 'A5';
  /** PDF landscape mode */
  landscape?: boolean;
}

const DEFAULT_OPTIONS: CLIOptions = {
  command: 'help',
  verbose: false,
  json: false,
  maxDepth: 10,
  timeout: 5000,
  showAST: false,
  packages: [],
  dev: false,
  brittneyUrl: process.env.BRITTNEY_SERVICE_URL,
  watch: false,
  split: false,
  tickRate: 10,
  duration: 0,
};

export function parseArgs(args: string[]): CLIOptions {
  const options: CLIOptions = { ...DEFAULT_OPTIONS };

  let i = 0;
  while (i < args.length) {
    const arg = args[i];

    // Commands
    if (!arg.startsWith('-')) {
      if (
        [
          'parse',
          'validate',
          'run',
          'ast',
          'repl',
          'watch',
          'compile',
          'build',
          'add',
          'remove',
          'list',
          'traits',
          'suggest',
          'generate',
          'templates',
          'pack',
          'unpack',
          'inspect',
          'diff',
          'wot-export',
          'headless',
          'package',
          'deploy',
          'monitor',
          'publish',
          'login',
          'logout',
          'whoami',
          'access',
          'org',
          'token',
          'export',
          'import',
          'visualize',
          'absorb',
          'self-improve',
          'screenshot',
          'pdf',
          'prerender',
          'help',
          'version',
        ].includes(arg)
      ) {
        options.command = arg as CLIOptions['command'];
      } else if (['access', 'org', 'token'].includes(options.command) && !options.subcommand) {
        // Subcommands for access/org/token
        options.subcommand = arg;
      } else if (['add', 'remove'].includes(options.command)) {
        // Collect package names for add/remove commands
        options.packages.push(arg);
      } else if (['suggest', 'generate'].includes(options.command) && !options.description) {
        // Collect description for suggest/generate commands
        options.description = arg;
      } else if (!options.input) {
        options.input = arg;
      }
      i++;
      continue;
    }

    // Flags
    switch (arg) {
      case '-v':
      case '--verbose':
        options.verbose = true;
        break;
      case '-j':
      case '--json':
        options.json = true;
        break;
      case '-o':
      case '--output':
        options.output = args[++i];
        break;
      case '--max-depth':
        options.maxDepth = parseInt(args[++i], 10) || 10;
        break;
      case '--timeout':
        options.timeout = parseInt(args[++i], 10) || 5000;
        break;
      case '--show-ast':
        options.showAST = true;
        break;
      case '-D':
      case '--dev':
        options.dev = true;
        break;
      case '-h':
      case '--help':
        options.command = 'help';
        break;
      case '-V':
      case '--version':
        options.command = 'version';
        break;
      case '--brittney-url':
        options.brittneyUrl = args[++i];
        break;
      case '-t':
      case '--target':
        options.target = args[++i];
        break;
      case '-w':
      case '--watch':
        options.watch = true;
        break;
      case '--split':
        options.split = true;
        break;
      case '-p':
      case '--profile':
        options.profile = args[++i] as RuntimeProfileName;
        break;
      case '--tick-rate':
        options.tickRate = parseInt(args[++i], 10) || 10;
        break;
      case '--duration':
        options.duration = parseInt(args[++i], 10) || 0;
        break;
      case '--platform':
        options.platform = args[++i] as EdgePlatform;
        break;
      case '--host':
        options.host = args[++i];
        break;
      case '-u':
      case '--username':
        options.username = args[++i];
        break;
      case '-k':
      case '--key':
        options.keyPath = args[++i];
        break;
      case '--port':
        options.port = parseInt(args[++i], 10) || 22;
        break;
      case '--remote-path':
        options.remotePath = args[++i];
        break;
      case '--service-name':
        options.serviceName = args[++i];
        break;
      case '--dashboard':
        options.dashboard = true;
        break;
      case '--interval':
        options.interval = parseInt(args[++i], 10) || 2000;
        break;
      case '--dry-run':
        options.dryRun = true;
        break;
      case '-f':
      case '--force':
        options.force = true;
        break;
      case '--registry':
        options.registry = args[++i];
        break;
      case '--token':
        options.authToken = args[++i];
        break;
      case '--tag':
        options.tag = args[++i];
        break;
      case '--access':
        options.access = args[++i] as 'public' | 'restricted';
        break;
      case '--otp':
        options.otp = args[++i];
        break;
      case '--role':
        options.role = args[++i] as 'owner' | 'admin' | 'member';
        break;
      case '--permission':
        options.permission = args[++i] as 'read' | 'write' | 'admin';
        break;
      case '--name':
        options.tokenName = args[++i];
        break;
      case '--readonly':
        options.readonly = true;
        break;
      case '--scope':
        if (!options.scopes) options.scopes = [];
        options.scopes.push(args[++i]);
        break;
      case '--expires':
        options.expiresInDays = parseInt(args[++i], 10) || 30;
        break;
      case '--from':
        options.importSource = args[++i] as ImportSource;
        break;
      case '--scene-name':
        options.sceneName = args[++i];
        break;
      // Screenshot/render options
      case '--width':
        options.width = parseInt(args[++i], 10) || 1920;
        break;
      case '--height':
        options.height = parseInt(args[++i], 10) || 1080;
        break;
      case '--format':
        options.imageFormat = args[++i] as 'png' | 'jpeg' | 'webp';
        break;
      case '--quality':
        options.quality = parseInt(args[++i], 10) || 90;
        break;
      case '--scale':
        options.scale = parseFloat(args[++i]) || 1;
        break;
      case '--wait-for':
        options.waitFor = parseInt(args[++i], 10) || 2000;
        break;
      case '--page-format':
        options.pageFormat = args[++i] as 'A4' | 'Letter' | 'Legal' | 'Tabloid' | 'A3' | 'A5';
        break;
      case '--landscape':
        options.landscape = true;
        break;
      // Self-improve flags
      case '--cycles':
        options.cycles = parseInt(args[++i], 10) || 5;
        break;
      case '--harvest':
        options.harvest = true;
        break;
      case '--commit':
        options.autoCommit = true;
        break;
      case '--daemon':
        options.daemonMode = true;
        break;
      case '--max-failures':
        options.maxFailures = parseInt(args[++i], 10) || 3;
        break;
    }
    i++;
  }

  return options;
}

export function printHelp(): void {
  console.log(`
\x1b[36mHoloScript CLI v2.5.0\x1b[0m

Usage: holoscript <command> [options] [input]

\x1b[1mCommands:\x1b[0m
  parse <file>      Parse a HoloScript file and validate syntax
  run <file>        Execute a HoloScript file
  compile <file>    Compile to target platform (threejs, unity, vrchat)
  build <input>     Unified build/pack command (detects file vs dir)
                    Use -w or --watch for continuous build
  ast <file>        Output the AST as JSON
  repl              Start interactive REPL mode
  watch <file>      Watch file and re-execute on changes

  \x1b[33mTraits & Generation:\x1b[0m
  traits [name]     List all VR traits, or explain a specific trait
  suggest <desc>    Suggest appropriate traits for an object
  generate <desc>   Generate HoloScript from natural language
  templates         List available object templates

  \x1b[33mPackage Management:\x1b[0m
  add <pkg...>      Add HoloScript packages to current project
  remove <pkg...>   Remove HoloScript packages from current project
  list              List installed HoloScript packages
  publish           Publish package to HoloScript registry
                    Use --dry-run to preview without publishing

  \x1b[33mAuthentication:\x1b[0m
  login             Log in to HoloScript registry
  logout            Log out from HoloScript registry
  whoami            Display current logged-in user

  \x1b[33mAccess Control:\x1b[0m
  access grant <pkg> <user>     Grant access to a package
  access revoke <pkg> <user>    Revoke access from a package
  access list <pkg>             List access for a package
  org create <name>             Create an organization
  org add-member <org> <user>   Add member to organization
  org remove-member <org> <user> Remove member from organization
  org list-members <org>        List organization members
  token create                  Create authentication token
  token revoke <id>             Revoke authentication token
  token list                    List your tokens

  \x1b[33mDiff & Analysis:\x1b[0m
  diff <a> <b>      Compare two HoloScript files (semantic diff)
                    Use --json for machine-readable output

  \x1b[33mIoT & Ecosystem:\x1b[0m
  wot-export <file> Generate W3C Thing Description from @wot_thing objects
                    Use --json for JSON output, -o for output file
  headless <file>   Run HoloScript in headless mode (no rendering)
                    Ideal for IoT, edge computing, testing
                    Use --profile to select runtime profile

  \x1b[33mEdge Deployment:\x1b[0m
  package <source>  Package HoloScript for edge deployment
                    Supports linux-arm64, linux-x64, windows-x64, wasm
  deploy <package>  Deploy package to remote device via SSH
                    Includes systemd service setup and OTA updates
  monitor <host>    Monitor deployed HoloScript on remote device
                    Live dashboard with CPU, memory, and metrics

  \x1b[33mHeadless Rendering:\x1b[0m
  screenshot <file> Capture PNG/JPEG/WebP screenshot of scene
                    Uses Puppeteer for headless Chrome rendering
  pdf <file>        Generate PDF document of scene
                    Supports A4, Letter, and other page formats
  prerender <file>  Pre-render HTML for SEO/social sharing
                    Outputs fully rendered HTML with meta tags

  \x1b[33mSelf-Improvement:\x1b[0m
  self-improve      Run autonomous self-improvement pipeline
                    Absorbs codebase, finds untested code via GraphRAG,
                    generates tests, validates, and optionally commits
                    Use --cycles N to set iteration count (default: 5)
                    Use --harvest to capture JSONL training data
                    Use --commit to auto-commit passing tests
                    Use --daemon for continuous mode
                    Use --max-failures N to set failure threshold

  help              Show this help message
  version           Show version information

\x1b[1mOptions:\x1b[0m
  -v, --verbose       Enable verbose output
  -j, --json          Output results as JSON
  -o, --output        Write output to file
  -t, --target        Compile target (threejs, unity, vrchat, babylon, wasm)
  -p, --profile       Runtime profile (headless, minimal, standard, vr)
  --tick-rate <hz>    Tick rate for headless runtime (default: 10)
  --duration <ms>     Duration to run headless (0 = indefinite)
  --max-depth <n>     Max execution depth (default: 10)
  --timeout <ms>      Execution timeout in ms (default: 5000)
  --show-ast          Show AST during REPL execution
  -D, --dev           Install as dev dependency (for add command)
  --brittney-url      Brittney AI service URL (optional, enhances generation)
  -w, --watch         Enable watch mode for continuous execution/build

  \x1b[2m# Edge Deployment Options\x1b[0m
  --platform <plat>   Target platform (linux-arm64, linux-x64, windows-x64, wasm)
  --host <host>       Remote host IP or hostname
  -u, --username      SSH username (default: holoscript)
  -k, --key <path>    SSH private key path
  --port <port>       SSH port (default: 22)
  --remote-path       Remote installation path (default: /opt/holoscript)
  --service-name      Systemd service name
  --dashboard         Enable real-time dashboard for monitor
  --interval <ms>     Refresh interval for monitor (default: 2000)

  \x1b[2m# Package Publishing Options\x1b[0m
  --dry-run           Preview publish without uploading
  -f, --force         Publish even with warnings
  --registry <url>    Registry URL (default: https://registry.holoscript.net)
  --token <token>     Authentication token
  --tag <tag>         Version tag (default: "latest")
  --access <level>    Access level: public or restricted
  --otp <code>        One-time password for 2FA

  \x1b[2m# Access Control Options\x1b[0m
  --permission <perm> Permission level: read, write, or admin
  --role <role>       Organization role: owner, admin, or member
  --name <name>       Token name
  --readonly          Create read-only token
  --scope <scope>     Token scope (can be repeated)
  --expires <days>    Token expiration in days

  \x1b[2m# Headless Rendering Options\x1b[0m
  --width <px>        Screenshot width (default: 1920)
  --height <px>       Screenshot height (default: 1080)
  --format <fmt>      Image format: png, jpeg, webp (default: png)
  --quality <n>       JPEG/WebP quality 0-100 (default: 90)
  --scale <n>         Device scale factor for retina (default: 1)
  --wait-for <ms>     Wait time for scene to stabilize (default: 2000)
  --page-format       PDF page format: A4, Letter, Legal, etc.
  --landscape         PDF landscape orientation

  \x1b[2m# Self-Improvement Options\x1b[0m
  --cycles <n>        Number of improvement cycles (default: 5)
  --harvest           Enable JSONL training data capture
  --commit            Auto-commit passing tests to git
  --daemon            Continuous improvement mode (runs until converged)
  --max-failures <n>  Max consecutive failures before aborting (default: 3)

\x1b[1mExamples:\x1b[0m
  holoscript parse world.hs
  holoscript run world.hs --verbose
  holoscript compile world.holo --target threejs
  holoscript compile world.holo --target unity -o output/
  holoscript ast world.hs -o ast.json
  holoscript repl
  holoscript watch world.hs
  
  holoscript build world.holo --target threejs
  holoscript build components/glowing_orb/

  \x1b[2m# Traits & Generation\x1b[0m
  holoscript traits                    # List all 49 VR traits
  holoscript traits grabbable          # Explain @grabbable trait
  holoscript suggest "glowing orb"     # Suggest traits for object
  holoscript generate "red button"     # Generate HoloScript code
  holoscript templates                 # List object templates

  \x1b[2m# Package Management\x1b[0m
  holoscript add @holoscript/std @holoscript/network
  holoscript add @holoscript/test --dev
  holoscript remove @holoscript/network
  holoscript list

  \x1b[2m# Publishing Packages\x1b[0m
  holoscript publish                    # Publish current package
  holoscript publish --dry-run          # Preview without publishing
  holoscript publish --tag beta         # Publish as beta version
  holoscript login                      # Log in to registry
  holoscript whoami                     # Show current user

  \x1b[2m# Access Control\x1b[0m
  holoscript org create mycompany       # Create organization
  holoscript org add-member mycompany user1 --role admin
  holoscript access grant @mycompany/pkg user2 --permission write
  holoscript token create --name "CI Token" --readonly
  holoscript token list                 # List your tokens

  \x1b[2m# Diff & Analysis\x1b[0m
  holoscript diff old.holo new.holo       # Semantic diff
  holoscript diff old.holo new.holo --json # Machine-readable output

  \x1b[2m# IoT & WoT Integration\x1b[0m
  holoscript wot-export scene.holo        # Generate W3C Thing Descriptions
  holoscript wot-export scene.holo -o td/ # Output to directory

  \x1b[2m# Headless Runtime (IoT, Edge, Testing)\x1b[0m
  holoscript headless device.holo              # Run without rendering
  holoscript headless device.holo --tick-rate 60  # 60Hz update rate
  holoscript headless device.holo --duration 5000 # Run for 5 seconds
  holoscript run scene.holo --profile minimal     # Use minimal profile

  \x1b[2m# WebAssembly Compilation\x1b[0m
  holoscript compile scene.holo --target wasm      # Generate WAT + bindings
  holoscript compile scene.holo --target wasm -o output.wat

  \x1b[2m# Edge Deployment\x1b[0m
  holoscript package scene.holo --platform linux-arm64   # Package for Raspberry Pi
  holoscript package . -o dist/edge                      # Package current directory
  holoscript deploy dist/edge --host 192.168.1.100       # Deploy via SSH
  holoscript deploy dist/edge --host pi.local -u pi      # Deploy with username
  holoscript monitor 192.168.1.100                       # Live monitoring
  holoscript monitor 192.168.1.100 --dashboard           # Real-time dashboard

  \x1b[2m# Headless Chrome Rendering (Puppeteer)\x1b[0m
  holoscript screenshot scene.holo                       # Capture PNG screenshot
  holoscript screenshot scene.holo -o preview.png        # Custom output path
  holoscript screenshot scene.holo --width 1920 --height 1080
  holoscript screenshot scene.holo --format jpeg --quality 85
  holoscript pdf scene.holo                              # Generate PDF
  holoscript pdf scene.holo --page-format A4 --landscape
  holoscript prerender scene.holo                        # SEO-ready HTML

  \x1b[2m# Self-Improvement\x1b[0m
  holoscript self-improve                     # Run 5 cycles (default)
  holoscript self-improve --cycles 10         # Run 10 improvement cycles
  holoscript self-improve --harvest --commit  # Harvest training data + auto-commit
  holoscript self-improve --daemon            # Continuous mode until convergence
  holoscript self-improve --daemon --verbose  # Continuous with detailed output
  holoscript self-improve --max-failures 5    # Allow more retries

\x1b[1mAliases:\x1b[0m
  hs              Short alias for holoscript

\x1b[2mBrittney AI: Set BRITTNEY_SERVICE_URL for enhanced generation.\x1b[0m
`);
}
