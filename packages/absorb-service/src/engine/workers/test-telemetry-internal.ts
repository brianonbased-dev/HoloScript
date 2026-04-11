import { WorkerPool } from './WorkerPool';
import * as path from 'path';

async function test() {
  console.log('--- Starting WorkerPool Telemetry Test (Co-located) ---');
  
  // Point to the DIST version of the worker
  const workerPath = path.resolve('../../../dist/engine/workers/parse-worker.js');
  console.log('Using worker path:', workerPath);
  
  const pool = new WorkerPool(workerPath, 2);
  
  try {
    console.log('Initial Telemetry:', JSON.stringify(pool.getTelemetry(), null, 2));
    
    console.log('\n--- Executing Jobs ---');
    const jobs = Array.from({ length: 5 }, (_, i) => 
      pool.execute({ 
        filePath: `test-${i}.ts`, 
        content: `const x = ${i};`, 
        language: 'typescript' 
      })
    );
    
    await Promise.all(jobs);

    const telemetry = pool.getTelemetry();
    console.log('\nFinal Telemetry:', JSON.stringify(telemetry, null, 2));

    if (telemetry && telemetry.stats && telemetry.stats.totalJobs === 5) {
      console.log('\nPASSED: Telemetry stats updated correctly.');
    } else {
      console.log('\nFAILED: Telemetry stats did not update as expected.');
    }
  } catch (err) {
    console.error('Test error:', err);
  } finally {
    await pool.terminate();
    console.log('\n--- Test Complete ---');
  }
}

test().catch(console.error);
