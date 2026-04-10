import { spawn } from 'child_process';
import * as path from 'path';

/**
 * Interface representing the result of a radio astronomy physics calculation.
 */
export interface AstropyResult {
  wavelength_meters?: number;
  frequency_hz?: number;
  flux_density_jy?: number;
  error?: string;
}

/**
 * Runner that bridges HoloScript to the underlying astropy Python toolkit.
 */
export class PythonAstropyBridge {
  private scriptPath: string;

  constructor() {
    this.scriptPath = path.resolve(__dirname, '../../python/astropy_bridge.py');
  }

  /**
   * Dispatches a calculation to the Python environment.
   * @param command The astronomical command to invoke (e.g. 'calc_synchrotron')
   * @param params JSON payload of parameters
   * @returns A promise resolving to the astronomical result payload
   */
  public async executeCommand(
    command: string,
    params: Record<string, any>
  ): Promise<AstropyResult> {
    return new Promise((resolve, reject) => {
      const process = spawn('python', [this.scriptPath, command, JSON.stringify(params)]);

      let output = '';
      let errorOutput = '';

      process.stdout.on('data', (data) => {
        output += data.toString();
      });

      process.stderr.on('data', (data) => {
        errorOutput += data.toString();
      });

      process.on('close', (code) => {
        if (code !== 0) {
          return reject(new Error(`Astropy bridge exited with code ${code}: ${errorOutput}`));
        }
        try {
          // Attempt to parse JSON line output from python script
          const parsed = JSON.parse(output.trim());
          resolve(parsed as AstropyResult);
        } catch (e) {
          reject(new Error(`Failed to parse bridge output: ${output}`));
        }
      });
    });
  }
}
