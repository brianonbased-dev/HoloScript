import {
  AdaptiveFrameRateManager,
  MarketplaceRegistry,
  randomUUID,
  sha256,
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
const registry: MarketplaceRegistry = new MarketplaceRegistry();
const requestId: string = randomUUID();
const digest: Promise<string> = sha256('public type consumer fixture');
const walletConnect: Web3Connector['connectWallet'] = connector.connectWallet;

void [
  digest,
  manifest,
  policy,
  registry,
  requestId,
  thermalState,
  walletConnect,
];
