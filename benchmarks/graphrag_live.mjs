import fs from 'fs';
import { config } from 'dotenv';
config({ path: 'c:/Users/josep/.ai-ecosystem/.env' });

async function runBenchmark() {
  console.log('--- Starting GraphRAG Live Benchmark ---');
  
  const headers = { 
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${process.env.ABSORB_API_KEY}`
  };

  // 1. Scan the repository
  const scanStart = performance.now();
  let scanRes;
  try {
    scanRes = await fetch('https://absorb.holoscript.net/api/absorb/scan', {
      method: 'POST',
      headers,
      body: JSON.stringify({ path: '/app', shallow: true })
    });
  } catch (e) {
    console.error('Fetch error during scan:', e);
    return;
  }

  if (!scanRes.ok) {
    console.error(`Scan failed with status ${scanRes.status}:`, await scanRes.text());
    return;
  }

  const scanJson = await scanRes.json();
  const scanEnd = performance.now();

  console.log(`\n✅ Codebase Scan Completed!`);
  console.log(`Latency: ${(scanEnd - scanStart).toFixed(2)} ms`);
  console.log(`Files Processed: ${scanJson.fileCount || 0}`);
  console.log(`GraphID: ${scanJson.graphId}`);
  
  if (!scanJson.graphId) {
    console.error('No graphId returned. Aborting query test.');
    return;
  }

  // 2. Query the GraphRAG
  const queryStart = performance.now();
  let queryRes;
  try {
    queryRes = await fetch('https://absorb.holoscript.net/api/absorb/query', {
      method: 'POST',
      headers,
      body: JSON.stringify({ graphId: scanJson.graphId, query: 'find CodebaseScanner logic', maxResults: 5 })
    });
  } catch (e) {
    console.error('Fetch error during query:', e);
    return;
  }

  if (!queryRes.ok) {
    console.error(`Query failed with status ${queryRes.status}:`, await queryRes.text());
    return;
  }

  const queryJson = await queryRes.json();
  const queryEnd = performance.now();

  console.log(`\n✅ GraphRAG Query Completed!`);
  console.log(`Latency: ${(queryEnd - queryStart).toFixed(2)} ms`);
  console.log(`Top 5 Accuracy (P@5): Validating output format...`);
  console.log(`Results found: ${queryJson.results?.length ?? 0}`);
  
  queryJson.results?.forEach((r, idx) => {
    console.log(`  [${idx + 1}] (${r.score.toFixed(3)}) ${r.symbol || 'unknown'} - ${r.file || r.type || 'unknown'}`);
  });
  
  console.log('\n--- Benchmark Finished ---');
}

runBenchmark();
