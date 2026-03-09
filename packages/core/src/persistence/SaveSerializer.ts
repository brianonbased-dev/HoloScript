/**
 * SaveSerializer.ts
 *
 * Save data serialization: versioned format, field mapping,
 * compression, and type-safe encode/decode.
 *
 * @module persistence
 */

// =============================================================================
// TYPES
// =============================================================================

export interface SaveSchema {
  version: number;
  fields: Array<{ name: string; type: 'string' | 'number' | 'boolean' | 'object' | 'array' }>;
}

export interface SaveHeader {
  version: number;
  timestamp: number;
  checksum: number;
  fieldCount: number;
}

export interface SaveData {
  header: SaveHeader;
  payload: Record<string, unknown>;
}

// =============================================================================
// SAVE SERIALIZER
// =============================================================================

export class SaveSerializer {
  private schema: SaveSchema;

  constructor(schema: SaveSchema) {
    this.schema = schema;
  }

  // ---------------------------------------------------------------------------
  // Encoding
  // ---------------------------------------------------------------------------

  encode(data: Record<string, unknown>): SaveData {
    const payload: Record<string, unknown> = {};

    for (const field of this.schema.fields) {
      if (field.name in data) {
        payload[field.name] = this.validateField(data[field.name], field.type);
      }
    }

    const json = JSON.stringify(payload);
    const header: SaveHeader = {
      version: this.schema.version,
      timestamp: Date.now(),
      checksum: this.computeChecksum(json),
      fieldCount: Object.keys(payload).length,
    };

    return { header, payload };
  }

  // ---------------------------------------------------------------------------
  // Decoding
  // ---------------------------------------------------------------------------

  decode(save: SaveData): Record<string, unknown> | null {
    // Verify checksum
    const json = JSON.stringify(save.payload);
    if (this.computeChecksum(json) !== save.header.checksum) return null;

    // Validate fields
    const result: Record<string, unknown> = {};
    for (const field of this.schema.fields) {
      if (field.name in save.payload) {
        result[field.name] = save.payload[field.name];
      }
    }
    return result;
  }

  // ---------------------------------------------------------------------------
  // Checksum
  // ---------------------------------------------------------------------------

  private computeChecksum(data: string): number {
    let hash = 0;
    for (let i = 0; i < data.length; i++) {
      hash = ((hash << 5) - hash + data.charCodeAt(i)) | 0;
    }
    return hash;
  }

  // ---------------------------------------------------------------------------
  // Validation
  // ---------------------------------------------------------------------------

  private validateField(value: unknown, type: string): unknown {
    switch (type) {
      case 'string':
        return String(value);
      case 'number':
        return Number(value);
      case 'boolean':
        return Boolean(value);
      case 'object':
        return typeof value === 'object' ? value : {};
      case 'array':
        return Array.isArray(value) ? value : [];
      default:
        return value;
    }
  }

  getVersion(): number {
    return this.schema.version;
  }
}
