import type { ReconstructionManifest } from './HoloMapRuntime';
import { HOLOMAP_SIMULATION_CONTRACT_KIND } from './contractConstants';

export { HOLOMAP_SIMULATION_CONTRACT_KIND };

export function assertHoloMapManifestContract(m: ReconstructionManifest): void {
  if (m.version !== '1.0.0') {
    throw new Error(`HoloMap manifest version ${m.version} is not v1.0 contract`);
  }
  if (m.simulationContract.kind !== HOLOMAP_SIMULATION_CONTRACT_KIND) {
    throw new Error(`Unexpected SimulationContract kind: ${m.simulationContract.kind}`);
  }
  if (!m.simulationContract.replayFingerprint || m.simulationContract.replayFingerprint.length < 8) {
    throw new Error('HoloMap manifest missing replayFingerprint');
  }
}
