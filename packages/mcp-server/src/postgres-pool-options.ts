export interface RailwayPostgresPoolOptions {
  connectionString: string;
  ssl: false | { rejectUnauthorized: false };
  max?: number;
}

export function createRailwayPostgresPoolOptions(
  databaseUrl: string,
  extras: Omit<Partial<RailwayPostgresPoolOptions>, 'connectionString' | 'ssl'> = {}
): RailwayPostgresPoolOptions {
  return {
    connectionString: databaseUrl,
    ssl: process.env.DATABASE_SSL === 'false' ? false : { rejectUnauthorized: false },
    ...extras,
  };
}
