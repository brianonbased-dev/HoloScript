import {
  AdaptiveFrameRateManager,
  LocalRegistry,
  PACKAGE_IR_SCHEMA_VERSION,
  createPackageLockReceipt,
  randomUUID,
  sha256,
  validatePackageIR,
  type PackageIR,
  type PackageManifest,
  type SecurityPolicy,
  type ThermalState,
  type Web3Connector,
} from '@holoscript/platform';

declare const manifest: PackageManifest;
declare const policy: SecurityPolicy;
declare const connector: Web3Connector;

const manager = new AdaptiveFrameRateManager({ maxHistory: 4 });
manager.recordFrame(16, 0);

const thermalState: ThermalState = manager.getThermalState();
const registry: LocalRegistry = new LocalRegistry();
registry.publish({ name: '@holoscript/example', version: '1.0.0' });
const requestId: string = randomUUID();
const digest: Promise<string> = sha256('public type consumer fixture');
const walletConnect: Web3Connector['connectWallet'] = connector.connectWallet;
const packageIR: PackageIR = {
  schemaVersion: PACKAGE_IR_SCHEMA_VERSION,
  name: '@holoscript/public-consumer-fixture',
  version: '1.0.0',
  kind: 'library',
  supportTier: 'preview',
  entrypoints: { source: './src/index.hsplus' },
  dependencies: {},
  compatibility: { holoscript: '>=8.0.0', targets: ['node'] },
  capabilities: [],
  provenance: {
    license: 'MIT',
    repository: 'https://github.com/brianonbased-dev/HoloScript',
    owner: 'HoloScript',
  },
};
const packageValidation: boolean = validatePackageIR(packageIR).valid;
const packageLock = createPackageLockReceipt(packageIR, []);

void [
  digest,
  manifest,
  packageIR,
  packageLock,
  packageValidation,
  policy,
  registry,
  requestId,
  thermalState,
  walletConnect,
];
