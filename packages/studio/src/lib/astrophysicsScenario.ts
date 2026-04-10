export interface RadioSpectrumEvent {
  eventId: string;
  rightAscension: number; // Degrees
  declination: number;    // Degrees
  frequencyMHz: number;
  fluxDensityJy: number;  // Janskys
}

export interface VolumetricMapping {
  colorHex: string;
  bloomIntensity: number;
  scaleX: number;
  scaleY: number;
  scaleZ: number;
}

/**
 * Maps incoming radio frequency data to HoloScript volumetric properties
 * @param event Radio telemetry data point
 * @returns Visual trait mappings (Color, Glow, Scale)
 */
export function mapRadioToVolumetric(event: RadioSpectrumEvent): VolumetricMapping {
  // Neutral hydrogen line is ~1420 MHz
  const H_LINE = 1420.4;
  const dopplerShift = H_LINE - event.frequencyMHz;
  
  // Redshift (>0) goes red, Blueshift (<0) goes blue
  let colorHex = '#ffffff';
  if (dopplerShift > 0.5) colorHex = '#ef4444'; // Redshift
  else if (dopplerShift < -0.5) colorHex = '#3b82f6'; // Blueshift
  else colorHex = '#10b981'; // Rest frequency (Green/Neutral)

  // Flux Density determines the bloom / luminous intensity in spatial rendering
  // Base bloom 0.1, clamped
  const bloomIntensity = Math.min(Math.max(event.fluxDensityJy * 0.5, 0.1), 5.0);

  return {
    colorHex,
    bloomIntensity,
    scaleX: bloomIntensity * 1.5,
    scaleY: bloomIntensity * 1.5,
    scaleZ: bloomIntensity * 1.5,
  };
}

/**
 * Simulates a pulsar timing interval based on rotation frequency
 * @param periodSeconds 
 * @param totalTimeSeconds 
 * @returns Array of timestamp hits when the pulsar's beam hits Earth
 */
export function calculatePulsarBeats(periodSeconds: number, totalTimeSeconds: number): number[] {
  const beats: number[] = [];
  let currentTime = 0;
  while (currentTime <= totalTimeSeconds) {
    beats.push(currentTime);
    currentTime += periodSeconds;
  }
  return beats;
}

/**
 * Filters out Radio Frequency Interference (RFI) using basic thresholding
 * In v6, this would pipe to the SNN WebGPU processor
 */
export function filterRFI(events: RadioSpectrumEvent[], thresholdJy: number): RadioSpectrumEvent[] {
  // Discard any event with a flux density obnoxiously high (e.g. artificial satellites)
  return events.filter(e => e.fluxDensityJy < thresholdJy);
}
