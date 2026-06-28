export interface RailwayPostgresPoolOptions {
  connectionString: string;
  ssl: false | { rejectUnauthorized: false };
}

export function createRailwayPostgresPoolOptions(
  databaseUrl: string
): RailwayPostgresPoolOptions {
  return {
    connectionString: databaseUrl,
    ssl: process.env.DATABASE_SSL === 'false' ? false : { rejectUnauthorized: false },
  };
}
