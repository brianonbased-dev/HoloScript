export interface HoloScriptSystemsDistribution {
  id: string;
  version: string;
  channel: string;
  machineContract: string;
  sourceCommit: string;
}

export interface HoloScriptSystemsReleaseManifest {
  schema: string;
  distributionId: string;
  version: string;
  channel: string;
  machineContract: string;
  sourceCommit: string;
  components: Record<string, string>;
  embeddedArtifactDigests: Record<string, string>;
}

export const releaseManifest: HoloScriptSystemsReleaseManifest;
export const distribution: Readonly<HoloScriptSystemsDistribution>;
export const nativeCompilerPath: string;
export const wasmModulePath: string;
export const conformanceSourcePath: string;
export function assertSupportedHost(): true;
