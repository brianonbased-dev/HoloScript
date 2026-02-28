/**
 * Example 3: Task Monitoring
 *
 * Monitor long-running tasks with progress and logs
 */

import React, { useState } from 'react';
import { useAgent, TaskMonitor } from '@hololand/react-agent-sdk';

export function TaskMonitoringExample() {
  const { agent } = useAgent('brittney');
  const [taskId, setTaskId] = useState<string>();

  const handleStartTask = async () => {
    const result = await agent.executeTask('deployToProduction', {
      input: { environment: 'prod', branch: 'main' },
    });
    setTaskId(result.taskId);
  };

  return (
    <div>
      <button onClick={handleStartTask}>Deploy to Production</button>

      {taskId && (
        <TaskMonitor
          taskId={taskId}
          showLogs
          showProgress
          showPhase
        />
      )}
    </div>
  );
}
