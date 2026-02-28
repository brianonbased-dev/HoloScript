/**
 * Example 9: Multi-Agent Coordination
 *
 * Coordinate multiple agents for complex workflows
 */

import React, { useState } from 'react';
import { useAgent, useTask } from '@hololand/react-agent-sdk';

export function MultiAgentExample() {
  const codeAgent = useAgent('brittney');
  const testAgent = useAgent('testRunner');
  const deployAgent = useAgent('deployer');

  const [step, setStep] = useState(1);

  // Step 1: Generate code
  const codeResult = useTask(
    codeAgent.agent,
    'generateComponent',
    {
      input: { componentName: 'UserProfile' },
    }
  );

  // Step 2: Generate tests (only if code is ready)
  const testResult = useTask(
    step >= 2 ? testAgent.agent : null,
    'generateTests',
    {
      input: { component: codeResult.data },
    }
  );

  // Step 3: Deploy (only if tests pass)
  const deployResult = useTask(
    step >= 3 ? deployAgent.agent : null,
    'deploy',
    {
      input: { code: codeResult.data, tests: testResult.data },
    }
  );

  return (
    <div>
      <h1>Multi-Agent Workflow</h1>

      <div>
        <h2>Step 1: Generate Code</h2>
        {codeResult.loading && <div>Generating...</div>}
        {codeResult.data && (
          <>
            <pre>{JSON.stringify(codeResult.data, null, 2)}</pre>
            <button onClick={() => setStep(2)}>Next: Generate Tests</button>
          </>
        )}
      </div>

      {step >= 2 && (
        <div>
          <h2>Step 2: Generate Tests</h2>
          {testResult.loading && <div>Generating tests...</div>}
          {testResult.data && (
            <>
              <pre>{JSON.stringify(testResult.data, null, 2)}</pre>
              <button onClick={() => setStep(3)}>Next: Deploy</button>
            </>
          )}
        </div>
      )}

      {step >= 3 && (
        <div>
          <h2>Step 3: Deploy</h2>
          {deployResult.loading && <div>Deploying...</div>}
          {deployResult.data && (
            <div style={{ background: '#e8f5e9', padding: '16px' }}>
              Deployment successful!
            </div>
          )}
        </div>
      )}
    </div>
  );
}
