/**
 * CLI argument parsing
 */
export type RuntimeProfileName = 'headless' | 'minimal' | 'standard' | 'vr';
export type EdgePlatform = 'linux-arm64' | 'linux-x64' | 'windows-x64' | 'wasm';
export type ExportFormat = 'gltf' | 'glb' | 'usdz' | 'babylon' | 'unity' | 'unreal';
export type ImportSource = 'unity' | 'godot' | 'gltf';
export interface CLIOptions {
    command: 'parse' | 'validate' | 'run' | 'ast' | 'repl' | 'watch' | 'compile' | 'build' | 'add' | 'remove' | 'list' | 'traits' | 'suggest' | 'generate' | 'templates' | 'pack' | 'unpack' | 'inspect' | 'diff' | 'wot-export' | 'headless' | 'package' | 'deploy' | 'monitor' | 'publish' | 'login' | 'logout' | 'whoami' | 'access' | 'org' | 'token' | 'export' | 'import' | 'visualize' | 'screenshot' | 'prerender' | 'pdf' | 'help' | 'version';
    input?: string;
    output?: string;
    verbose: boolean;
    json: boolean;
    maxDepth: number;
    timeout: number;
    showAST: boolean;
    packages: string[];
    dev: boolean;
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
export declare function parseArgs(args: string[]): CLIOptions;
export declare function printHelp(): void;
