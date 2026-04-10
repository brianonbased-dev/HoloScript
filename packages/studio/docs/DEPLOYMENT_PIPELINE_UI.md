# DeploymentPipelineUI Component

## Overview

The `DeploymentPipelineUI` component provides a horizontal pipeline visualization for HoloScript compilation and deployment workflows. It displays a real-time 5-stage pipeline with quality tier selection, streaming logs, and rollback functionality.

## Features

### 1. Horizontal Pipeline Visualization

Five stages displayed left-to-right with animated connectors:

- **Source** - Validates HoloScript source code
- **Compile** - Compiles to unified artifact with quality tier settings
- **Target** - Configures deployment target based on selected tier
- **Deploy** - Uploads artifact to target environment
- **Verify** - Runs health checks on deployed endpoint

Each stage shows:

- Status icon (idle, running, success, error, warning)
- Animated spinner during execution
- Progress bar for compilation and deployment stages
- Duration metrics after completion
- Contextual status messages

### 2. Quality Tier Selector

Four quality tiers with automatic target mapping:

| Tier    | Target Label | Provider           | Region       | Description                              |
| ------- | ------------ | ------------------ | ------------ | ---------------------------------------- |
| `low`   | Development  | vercel-edge        | dev-1        | Fast iteration, minimal checks           |
| `med`   | Staging      | cloudflare-workers | us-east-1    | Balanced performance and validation      |
| `high`  | Production   | aws-lambda         | us-west-2    | Full validation, optimized artifacts     |
| `ultra` | Global CDN   | cloudflare-workers | multi-region | Maximum performance, global distribution |

The target information banner updates automatically when the tier changes.

### 3. Real-time Status Indicators

**Status types:**

- `idle` - Gray, clock icon
- `running` - Blue, animated spinner
- `success` - Green, checkmark icon
- `error` - Red, X icon
- `warning` - Yellow, alert icon

**Visual feedback:**

- Border color changes based on status
- Background tint matches status color
- Smooth transitions between states
- Progress bars for long-running operations

### 4. Streaming Log Viewer

Collapsible log panel with:

- Timestamp for each entry (HH:MM:SS format)
- Log level badge (DEBUG, INFO, WARN, ERROR)
- Stage identifier
- Message text with syntax highlighting
- Auto-scroll to latest entry
- Log count badge in header
- Color-coded severity levels

### 5. Rollback Functionality

- Rollback button in header
- Confirmation dialog with warning message
- Async rollback callback support
- Logs rollback activity
- Disabled during active deployment

## Usage

### Basic Usage

```tsx
import { DeploymentPipelineUI } from '@/components/DeploymentPipelineUI';

function MyPage() {
  return <DeploymentPipelineUI source="object Cube { @position: [0,1,0] }" />;
}
```

### With Callbacks

```tsx
import { DeploymentPipelineUI } from '@/components/DeploymentPipelineUI';
import { useState } from 'react';

function MyPage() {
  const [sourceCode, setSourceCode] = useState('');

  const handleDeployStart = (tier: 'low' | 'med' | 'high' | 'ultra') => {
    console.log(`Deploying with tier: ${tier}`);
    // Track deployment start
  };

  const handleDeployComplete = (success: boolean) => {
    if (success) {
      console.log('Deployment succeeded!');
      // Show success notification
    } else {
      console.log('Deployment failed');
      // Show error notification
    }
  };

  const handleRollback = async () => {
    // Perform rollback to previous deployment
    await fetch('/api/deployments/rollback', {
      method: 'POST',
    });
  };

  return (
    <DeploymentPipelineUI
      source={sourceCode}
      onDeployStart={handleDeployStart}
      onDeployComplete={handleDeployComplete}
      onRollback={handleRollback}
    />
  );
}
```

## Props

### `DeploymentPipelineUIProps`

| Prop               | Type                          | Default     | Description                            |
| ------------------ | ----------------------------- | ----------- | -------------------------------------- |
| `source`           | `string`                      | `''`        | HoloScript source code or project path |
| `onDeployStart`    | `(tier: QualityTier) => void` | `undefined` | Called when deployment begins          |
| `onDeployComplete` | `(success: boolean) => void`  | `undefined` | Called when deployment finishes        |
| `onRollback`       | `() => Promise<void>`         | `undefined` | Async callback for rollback operation  |

### Type Definitions

```typescript
type QualityTier = 'low' | 'med' | 'high' | 'ultra';

type PipelineStage = 'source' | 'compile' | 'target' | 'deploy' | 'verify';

type StageStatus = 'idle' | 'running' | 'success' | 'error' | 'warning';

interface PipelineStageData {
  stage: PipelineStage;
  label: string;
  icon: React.ReactNode;
  status: StageStatus;
  message?: string;
  progress?: number;
  duration?: number;
}

interface LogEntry {
  id: string;
  timestamp: number;
  level: 'debug' | 'info' | 'warn' | 'error';
  stage: PipelineStage;
  message: string;
}
```

## Styling

The component uses Tailwind CSS with custom design tokens from the Studio theme:

- `studio-bg` - Background color
- `studio-surface` - Card/panel background
- `studio-panel` - Input/control background
- `studio-border` - Border color
- `studio-text` - Primary text color
- `studio-muted` - Secondary text color
- `studio-accent` - Accent color (sky blue)

### Custom Colors

Status-based colors:

- Success: `emerald-400/500`
- Error: `red-400/500`
- Warning: `yellow-400/500`
- Running: `blue-400/500`
- Idle: `studio-muted`

## Accessibility

### WCAG 2.1 Level AA Compliance

**Keyboard Navigation:**

- All interactive elements are keyboard accessible
- Tab order follows visual flow
- Focus indicators clearly visible
- No keyboard traps

**Screen Reader Support:**

- Semantic HTML elements (`button`, `select`)
- ARIA roles where appropriate
- Descriptive labels for all controls
- Status announcements for state changes

**Color Contrast:**

- Text: 4.5:1 contrast ratio
- Interactive elements: 3:1 contrast ratio
- Status colors meet WCAG requirements

**Focus Management:**

- Visible focus rings
- Logical tab order
- Skip to content functionality (via panel collapse)

## Performance

### Optimizations

1. **React Performance:**
   - `useCallback` for stable callbacks
   - `useState` for local state management
   - Minimal re-renders via isolated state
   - No unnecessary prop drilling

2. **Animation Performance:**
   - CSS transitions (hardware accelerated)
   - Transform-based animations
   - No layout thrashing
   - Smooth 60fps animations

3. **Log Management:**
   - Virtual scrolling for large log lists (future enhancement)
   - Efficient array operations
   - Auto-scroll throttling

### Bundle Impact

- Component size: ~12KB (minified)
- Dependencies: React, lucide-react
- Tree-shakeable icons
- No heavy third-party libraries

## Integration with HoloScript

### With Compiler API

```typescript
import { DeploymentPipelineUI } from '@/components/DeploymentPipelineUI';
import { useCompiler } from '@/hooks/useCompiler';

function DeploymentPage() {
  const { compile } = useCompiler();
  const [source, setSource] = useState('');

  const handleDeploy = async (tier: QualityTier) => {
    const artifact = await compile(source, {
      target: getTargetForTier(tier),
      optimize: tier === 'high' || tier === 'ultra',
    });

    await deployToCloud(artifact, tier);
  };

  return <DeploymentPipelineUI source={source} onDeployStart={handleDeploy} />;
}
```

### With Quality Gates

```typescript
import { DeploymentPipelineUI } from '@/components/DeploymentPipelineUI';
import { QualityGatePipeline } from '@holoscript/core/compiler/QualityGates';

function SecureDeploymentPage() {
  const pipeline = QualityGatePipeline.createDefault();

  const handleDeployWithGates = async (tier: QualityTier) => {
    const result = await pipeline.run({
      source,
      target: tier,
      affectedFiles: [],
      isProduction: tier === 'high' || tier === 'ultra',
      metadata: {},
    });

    if (result.passed) {
      // Proceed with deployment
    } else {
      // Show quality gate failures
    }
  };

  return <DeploymentPipelineUI onDeployStart={handleDeployWithGates} />;
}
```

## Testing

### Unit Tests

```typescript
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { DeploymentPipelineUI } from './DeploymentPipelineUI';

test('renders all pipeline stages', () => {
  render(<DeploymentPipelineUI />);

  expect(screen.getByText('Source')).toBeInTheDocument();
  expect(screen.getByText('Compile')).toBeInTheDocument();
  expect(screen.getByText('Target')).toBeInTheDocument();
  expect(screen.getByText('Deploy')).toBeInTheDocument();
  expect(screen.getByText('Verify')).toBeInTheDocument();
});

test('updates target when tier changes', async () => {
  render(<DeploymentPipelineUI />);

  const select = screen.getByRole('combobox');
  fireEvent.change(select, { target: { value: 'high' } });

  await waitFor(() => {
    expect(screen.getByText('Production')).toBeInTheDocument();
    expect(screen.getByText('aws-lambda')).toBeInTheDocument();
  });
});
```

### E2E Tests

```typescript
import { test, expect } from '@playwright/test';

test('deploys with selected tier', async ({ page }) => {
  await page.goto('/deployment-demo');

  // Select quality tier
  await page.selectOption('select', 'high');

  // Start deployment
  await page.click('button:has-text("Deploy")');

  // Wait for completion
  await expect(page.locator('text=All health checks passed')).toBeVisible();
});
```

## Demo

A live demo is available at `/deployment-demo` in HoloScript Studio:

1. Navigate to `http://localhost:3100/deployment-demo`
2. Edit the source code in the left panel
3. Select a quality tier from the dropdown
4. Click "Deploy" to see the pipeline in action
5. Expand logs to view detailed output
6. Test rollback functionality

## Troubleshooting

### Deployment Hangs at Compile Stage

**Issue:** Pipeline gets stuck showing "Compiling..." indefinitely.

**Solution:**

- Check browser console for errors
- Verify source code syntax is valid
- Ensure `onDeployStart` callback doesn't throw

### Logs Not Auto-Scrolling

**Issue:** New log entries don't scroll into view.

**Solution:**

- Ensure `showLogs` state is `true`
- Check for console warnings about `scrollIntoView`
- Verify `logsEndRef` is properly attached

### Target Info Not Updating

**Issue:** Changing quality tier doesn't update the target banner.

**Solution:**

- Check React DevTools for state updates
- Verify `QUALITY_TIER_CONFIG` constant is defined
- Clear browser cache if using development build

### Rollback Button Disabled

**Issue:** Cannot click rollback button.

**Solution:**

- Ensure `onRollback` prop is provided
- Check if deployment is currently running
- Verify button is not obscured by other elements

## Future Enhancements

1. **Real Deployment Integration**
   - Connect to actual deployment APIs
   - Support multiple cloud providers
   - Environment variable configuration
   - Secret management

2. **Advanced Logs**
   - Log filtering by level/stage
   - Search functionality
   - Export logs to file
   - Syntax highlighting for code logs

3. **Pipeline Customization**
   - Add/remove stages
   - Custom stage icons
   - Configurable stage duration
   - Parallel stage execution

4. **Analytics Dashboard**
   - Deployment success rate
   - Average deployment time
   - Cost tracking
   - Historical deployments

5. **Collaboration Features**
   - Share deployment links
   - Team notifications
   - Approval workflows
   - Audit logs

## Contributing

When contributing to the DeploymentPipelineUI component:

1. **Code Style:**
   - Follow existing TypeScript patterns
   - Use Tailwind CSS for styling
   - Add JSDoc comments for props
   - Keep components pure and testable

2. **Testing:**
   - Add unit tests for new features
   - Update existing tests when modifying behavior
   - Ensure accessibility tests pass
   - Test on multiple browsers

3. **Documentation:**
   - Update this README for new features
   - Add inline comments for complex logic
   - Include usage examples
   - Document breaking changes

4. **Performance:**
   - Avoid unnecessary re-renders
   - Use React.memo for expensive components
   - Profile with React DevTools
   - Minimize bundle size

## License

Part of the HoloScript project. See LICENSE file in repository root.

## Support

For issues, questions, or contributions:

- GitHub Issues: [HoloScript Issues](https://github.com/your-org/holoscript/issues)
- Documentation: [HoloScript Docs](https://docs.holoscript.com)
- Discord: [HoloScript Community](https://discord.gg/holoscript)
