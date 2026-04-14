import fs from 'fs';
import path from 'path';

// Read .env file
const envPath = 'C:/Users/josep/.ai-ecosystem/.env';
const envContent = fs.readFileSync(envPath, 'utf8');
envContent.split('\n').forEach(line => {
  const match = line.match(/^([^=]+)=(.*)$/);
  if (match) {
    process.env[match[1]] = match[2];
  }
});

const payload = {
  workspace_id: 'ai-ecosystem',
  entries: [
    {
      id: 'w_health_001',
      workspace_id: 'ai-ecosystem',
      type: 'wisdom',
      domain: 'codebase-health-april-2026',
      content: `# HoloScript Codebase Health & TODO Synthesis (April 2026)

## 1. Integration Locality Mismatch
**Finding:** Integration documentation (e.g., \`HOLOLAND_INTEGRATION_TODOS.md\`) specifies that \`AgentKitIntegration\`, \`x402PaymentService\`, and \`CreatorMonetization\` (Zora) should reside in \`packages/core\`.
**Reality:** These are fully implemented but isolated within \`packages/marketplace-api/src/\` (\`x402PaymentService.ts\`, \`CreatorMonetization.ts\`). Tests and compilation steps in \`core\` therefore perceive these features as missing or stubbed.

## 2. Export API Compliance Facade
**Finding:** \`@holoscript/export-api\` touts "SOC 2 compliance foundations" (audit logging, RBAC).
**Reality:** Code scan of \`services/export-api/src/routes/admin.ts\` reveals missing database persistence for API keys and usage tracking. Audit logs are appending to memory or mocked interfaces without \`pg\` or \`prisma\` dependencies.

## 3. Unexecuted Autonomous Horizon
**Finding:** The \`scripts/build/deploy-multi-agents.ts\` contains 7 critical/high priority unassigned research tasks (TODO-R1: Moderation Economics, TODO-R2: WASM Performance, TODO-I1: ECS+WASM).
**Actionable:** These agents need to be deployed to unblock the Phase 7 autonomous growth goals.

## 4. Studio UI Stubs & Coverage Debt
**Finding:** \`STUDIO_AUDIT.md\` lists critical e2e rendering path coverage gaps (3/10 score) and 5 stubbed pages (plugins, traits, templates, training-data, and holodaemon).

**Agent Handoff Instructions:**
- **@Cursor:** Bridge the Hololand integrations from \`marketplace-api\` into \`core\` and implement the missing PostgreSQL connectivity in \`export-api\`.
- **@Claude:** Execute the \`deploy-multi-agents.ts\` run and assimilate the 7 resulting architecture reports into the unified plan.`
    }
  ]
};

fetch('https://mcp-orchestrator-production-45f9.up.railway.app/knowledge/sync', {
  method: 'POST',
  headers: {
    'x-mcp-api-key': process.env.HOLOSCRIPT_API_KEY || '',
    'Content-Type': 'application/json'
  },
  body: JSON.stringify(payload)
})
.then(async res => {
  if (!res.ok) throw new Error(await res.text());
  console.log('Knowledge published successfully');
  console.log(await res.json());
})
.catch(err => {
  console.error('Failed to publish knowledge:', err.message);
});
