/**
 * Runs before every test file in this package (vitest.config.ts setupFiles), so before any of
 * them imports src/index.ts or src/http-server.ts. Their utils/load-env.ts reads
 * ~/.ai-ecosystem/.env at import and, on the laptop, asks the vault host for keys over ssh.
 * claude3's review of #474 (2026-10-04) watched a test resolve a real orchestrator key that way
 * and attempt a live submit. A seal written inside a test file sits wherever that file puts it,
 * and a hoisted import runs before it (task_1791156698918_qatv); here it cannot come late. A
 * suite that needs one of these names sets it itself, inside its own setup.
 */
const SECRET_NAMES = new Set([
  'HOLOSCRIPT_ORCHESTRATOR_API_KEY',
  'MCP_ORCHESTRATOR_API_KEY',
  'ORCHESTRATOR_API_KEY',
  'MCP_API_KEY',
  'HOLOSCRIPT_API_KEY',
  'HOLOSCRIPT_MCP_API_KEY',
  'HOLOMESH_API_KEY',
  'HOLOKEY_STORE_PATH',
  'SECRETS_VAULT_STORE_PATH',
  'DATABASE_URL',
]);
const SECRET_PREFIXES = ['SECRETS_VAULT_KEK_', 'HOLOKEY_PROD_KEK_'];

process.env.HOLOMESH_NO_DOTENV = '1'; // load-env.ts reads no .env and hydrates nothing from the vault
process.env.HOLOKEYD_HOST = ''; // and a resolver that ignored that flag would find no vault host
for (const name of Object.keys(process.env)) {
  if (SECRET_NAMES.has(name) || SECRET_PREFIXES.some((prefix) => name.startsWith(prefix))) {
    delete process.env[name];
  }
}
