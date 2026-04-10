import { Pool, PoolConfig, QueryResult, QueryResultRow } from 'pg';

export class PostgresPool {
  private pool: Pool;
  private static instance: PostgresPool;

  private constructor(config?: PoolConfig) {
    this.pool = new Pool(config);

    this.pool.on('error', (err) => {
      console.error('Unexpected error on idle client', err);
    });
  }

  public static getInstance(config?: PoolConfig): PostgresPool {
    if (!PostgresPool.instance) {
      PostgresPool.instance = new PostgresPool(config);
    }
    return PostgresPool.instance;
  }

  public async query<T extends QueryResultRow = any>(
    text: string,
    params?: any[]
  ): Promise<QueryResult<T>> {
    const _start = Date.now();
    try {
      const res = await this.pool.query(text, params);
      return res;
    } catch (error) {
      console.error('Database Query Error:', error);
      throw error;
    }
  }

  public async getClient() {
    return await this.pool.connect();
  }

  public async end() {
    await this.pool.end();
  }
}
