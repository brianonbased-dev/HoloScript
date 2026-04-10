import { PostgresPool } from './pool';
import { PoolConfig } from 'pg';
import cuid from 'cuid';

/**
 * Interface that HoloScript Runtime expects for database providers
 * (We will add this interface definition to @holoscript/core later)
 */
export interface IDatabaseProvider {
  query(sql: string, params?: any[]): Promise<any>;
  saveExecution(
    scriptId: string,
    code: string,
    status: string,
    executionTimeMs: number,
    output?: string,
    error?: string,
    agentId?: string
  ): Promise<void>;
}

export class PostgresHoloAdapter implements IDatabaseProvider {
  private db: PostgresPool;

  constructor(config?: PoolConfig | string) {
    if (typeof config === 'string') {
      this.db = PostgresPool.getInstance({ connectionString: config });
    } else {
      // Default to env if no config provided
      const connectionString = process.env.DATABASE_URL;
      this.db = PostgresPool.getInstance(config || { connectionString });
    }
  }

  /**
   * Execute a raw SQL query
   */
  async query(sql: string, params?: any[]): Promise<any> {
    const result = await this.db.query(sql, params);
    return result.rows;
  }

  /**
   * Save HoloScript execution metrics to the standardized schema
   */
  async saveExecution(
    scriptId: string,
    code: string,
    status: string,
    executionTimeMs: number,
    output?: string,
    error?: string,
    agentId: string = 'system'
  ): Promise<void> {
    const id = cuid();

    // We use the exact schema we consolidated in uaa2-service (migrations/001_core_schema.sql)
    const query = `
      INSERT INTO "HoloScriptExecution" 
      (id, "scriptId", script, status, "executionTimeMs", output, errors, "createdByAgent", "createdAt")
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())
    `;

    const params = [
      id,
      scriptId || cuid(), // Fallback if no scriptId provided
      code,
      status,
      executionTimeMs,
      output || null,
      error || null,
      agentId,
    ];

    try {
      await this.db.query(query, params);
    } catch (err) {
      console.error('Failed to save HoloScript execution log:', err);
      // We don't throw here to avoid crashing the runtime for logging failures
    }
  }
}
