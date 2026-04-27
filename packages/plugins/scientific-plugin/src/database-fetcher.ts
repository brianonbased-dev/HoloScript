/**
 * Database Fetcher for PDB and AlphaFold structures
 *
 * Implements the @database_query trait for automatic structure fetching
 * from RCSB PDB and AlphaFold Database.
 *
 * @packageDocumentation
 * @version 1.1.0
 */

import https from 'https';
import http from 'http';

export interface DatabaseQueryConfig {
  source: string; // Format: "pdb:1ABC" or "alphafold:P12345"
  timeout?: number; // Request timeout in ms (default: 30000)
}

export interface DatabaseQueryResult {
  pdbData: string;
  source: 'pdb' | 'alphafold';
  id: string;
  numAtoms?: number;
  metadata?: Record<string, any>;
}

/**
 * Database Fetcher for automatic structure loading
 *
 * @example
 * ```typescript
 * const fetcher = new DatabaseFetcher();
 *
 * // Fetch from PDB
 * const pdbResult = await fetcher.fetch({ source: 'pdb:7A4D' });
 *
 * // Fetch from AlphaFold
 * const afResult = await fetcher.fetch({ source: 'alphafold:P12345' });
 * ```
 */
export class DatabaseFetcher {
  private timeout: number;

  constructor(timeout: number = 30000) {
    this.timeout = timeout;
  }

  /**
   * Fetch structure from PDB or AlphaFold database
   *
   * @param config - Database query configuration
   * @returns Promise resolving to PDB data and metadata
   */
  async fetch(config: DatabaseQueryConfig): Promise<DatabaseQueryResult> {
    const { source, timeout = this.timeout } = config;

    // Parse source format: "pdb:1ABC" or "alphafold:P12345"
    const [dbType, id] = source.split(':');

    if (dbType === 'pdb') {
      return this.fetchPDB(id, timeout);
    } else if (dbType === 'alphafold') {
      return this.fetchAlphaFold(id, timeout);
    } else {
      throw new Error(`Unknown database type: ${dbType}. Use "pdb:ID" or "alphafold:ID"`);
    }
  }

  /**
   * Fetch structure from RCSB PDB
   *
   * @param pdbId - PDB ID (e.g., "1ABC", "7A4D")
   * @param timeout - Request timeout in ms
   * @returns Promise resolving to PDB data
   */
  private async fetchPDB(pdbId: string, timeout: number): Promise<DatabaseQueryResult> {
    const pdbIdUpper = pdbId.toUpperCase();
    const url = `https://files.rcsb.org/download/${pdbIdUpper}.pdb`;

    const pdbData = await this.httpGet(url, timeout);

    // Parse metadata from PDB header
    const metadata = this.parsePDBMetadata(pdbData);

    return {
      pdbData,
      source: 'pdb',
      id: pdbIdUpper,
      numAtoms: metadata.numAtoms,
      metadata,
    };
  }

  /**
   * Fetch structure from AlphaFold Database
   *
   * @param uniprotId - UniProt ID (e.g., "P12345")
   * @param timeout - Request timeout in ms
   * @returns Promise resolving to PDB data
   */
  private async fetchAlphaFold(uniprotId: string, timeout: number): Promise<DatabaseQueryResult> {
    const uniprotIdUpper = uniprotId.toUpperCase();
    const url = `https://alphafold.ebi.ac.uk/files/AF-${uniprotIdUpper}-F1-model_v4.pdb`;

    const pdbData = await this.httpGet(url, timeout);

    // Parse confidence scores (pLDDT) from AlphaFold PDB
    const metadata = this.parseAlphaFoldMetadata(pdbData);

    return {
      pdbData,
      source: 'alphafold',
      id: uniprotIdUpper,
      numAtoms: metadata.numAtoms,
      metadata,
    };
  }

  /**
   * HTTP GET request with timeout
   *
   * @param url - URL to fetch
   * @param timeout - Request timeout in ms
   * @returns Promise resolving to response body
   */
  private httpGet(url: string, timeout: number): Promise<string> {
    return new Promise((resolve, reject) => {
      const protocol = url.startsWith('https') ? https : http;

      const req = protocol.get(url, (res) => {
        if (res.statusCode !== 200) {
          reject(new Error(`HTTP ${res.statusCode}: ${res.statusMessage} for ${url}`));
          return;
        }

        let data = '';
        res.on('data', (chunk) => {
          data += chunk;
        });

        res.on('end', () => {
          resolve(data);
        });
      });

      req.on('error', (err) => {
        reject(new Error(`Network error: ${err.message}`));
      });

      req.setTimeout(timeout, () => {
        req.destroy();
        reject(new Error(`Request timeout after ${timeout}ms`));
      });
    });
  }

  /**
   * Parse metadata from PDB file
   *
   * @param pdbData - PDB file contents
   * @returns Metadata object
   */
  private parsePDBMetadata(pdbData: string): Record<string, any> {
    const lines = pdbData.split('\n');
    const metadata: Record<string, any> = {};

    // Count atoms
    const atomLines = lines.filter(
      (line) => line.startsWith('ATOM  ') || line.startsWith('HETATM')
    );
    metadata.numAtoms = atomLines.length;

    // Extract title
    const headerLine = lines.find((line) => line.startsWith('HEADER'));
    if (headerLine) {
      metadata.title = headerLine.substring(10, 50).trim();
      metadata.classification = headerLine.substring(10, 50).trim();
      metadata.depositDate = headerLine.substring(50, 59).trim();
      metadata.pdbId = headerLine.substring(62, 66).trim();
    }

    // Extract experimental method
    const expdtaLine = lines.find((line) => line.startsWith('EXPDTA'));
    if (expdtaLine) {
      metadata.experimentalMethod = expdtaLine.substring(10).trim();
    }

    // Extract resolution
    const remark2Line = lines.find((line) => line.startsWith('REMARK   2 RESOLUTION.'));
    if (remark2Line) {
      const resolutionMatch = remark2Line.match(/(\d+\.\d+) ANGSTROMS/);
      if (resolutionMatch) {
        metadata.resolution = parseFloat(resolutionMatch[1]);
      }
    }

    return metadata;
  }

  /**
   * Parse metadata from AlphaFold PDB file
   *
   * @param pdbData - PDB file contents
   * @returns Metadata object including confidence scores
   */
  private parseAlphaFoldMetadata(pdbData: string): Record<string, any> {
    const lines = pdbData.split('\n');
    const metadata: Record<string, any> = {};

    // Count atoms
    const atomLines = lines.filter((line) => line.startsWith('ATOM  '));
    metadata.numAtoms = atomLines.length;

    // Extract confidence scores (pLDDT in B-factor column)
    const bFactors = atomLines.map((line) => {
      const bFactor = parseFloat(line.substring(60, 66).trim());
      return bFactor;
    });

    if (bFactors.length > 0) {
      metadata.meanPLDDT = bFactors.reduce((a, b) => a + b, 0) / bFactors.length;
      metadata.minPLDDT = Math.min(...bFactors);
      metadata.maxPLDDT = Math.max(...bFactors);

      // Categorize confidence
      if (metadata.meanPLDDT >= 90) {
        metadata.confidence = 'Very High';
      } else if (metadata.meanPLDDT >= 70) {
        metadata.confidence = 'High';
      } else if (metadata.meanPLDDT >= 50) {
        metadata.confidence = 'Low';
      } else {
        metadata.confidence = 'Very Low';
      }
    }

    // Extract header
    const headerLine = lines.find((line) => line.startsWith('HEADER'));
    if (headerLine) {
      metadata.uniprotId = headerLine.substring(62, 66).trim();
    }

    // Model version
    const remarkLine = lines.find((line) => line.includes('AlphaFold'));
    if (remarkLine) {
      const versionMatch = remarkLine.match(/v(\d+)/);
      if (versionMatch) {
        metadata.alphaFoldVersion = parseInt(versionMatch[1]);
      }
    }

    return metadata;
  }

  /**
   * Save PDB data to file
   *
   * @param result - Database query result
   * @param outputPath - File path to save PDB data
   */
  async savePDB(result: DatabaseQueryResult, outputPath: string): Promise<void> {
    const fs = await import('fs/promises');
    await fs.writeFile(outputPath, result.pdbData, 'utf-8');
  }
}
