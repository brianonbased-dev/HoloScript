# DeploymentPipelineUI Component

## Quick Start

```tsx
import { DeploymentPipelineUI } from '@/components/DeploymentPipelineUI';

// Basic usage
<DeploymentPipelineUI source="object Cube { @position: [0,1,0] }" />

// With callbacks
<DeploymentPipelineUI
  source={code}
  onDeployStart={(tier) => console.log(`Deploy started: ${tier}`)}
  onDeployComplete={(success) => console.log(success ? 'Success!' : 'Failed')}
  onRollback={async () => {
    await rollbackToPrevious();
  }}
/>
```

## Features

- **5-Stage Pipeline:** Source → Compile → Target → Deploy → Verify
- **Quality Tiers:** Low (dev), Med (staging), High (prod), Ultra (global CDN)
- **Real-time Status:** Animated indicators, progress bars, durations
- **Streaming Logs:** Collapsible panel with auto-scroll, color-coded severity
- **Rollback:** Confirmation dialog, async callback support

## Demo

Visit `/deployment-demo` to see it in action with an interactive source editor.

## Documentation

See `docs/DEPLOYMENT_PIPELINE_UI.md` for complete API reference, examples, and integration guide.

## File Locations

- **Component:** `src/components/DeploymentPipelineUI.tsx`
- **Tests:** `src/components/DeploymentPipelineUI.test.tsx`
- **Demo Page:** `src/app/deployment-demo/page.tsx`
- **Docs:** `docs/DEPLOYMENT_PIPELINE_UI.md`

## Props

| Prop               | Type                           | Description                     |
| ------------------ | ------------------------------ | ------------------------------- |
| `source`           | `string?`                      | HoloScript source code          |
| `onDeployStart`    | `(tier: QualityTier) => void?` | Called when deployment begins   |
| `onDeployComplete` | `(success: boolean) => void?`  | Called when deployment finishes |
| `onRollback`       | `() => Promise<void>?`         | Async rollback callback         |

## Quality Tiers

| Tier    | Target      | Provider           | Use Case            |
| ------- | ----------- | ------------------ | ------------------- |
| `low`   | Development | vercel-edge        | Fast iteration      |
| `med`   | Staging     | cloudflare-workers | Testing             |
| `high`  | Production  | aws-lambda         | Live deployment     |
| `ultra` | Global CDN  | cloudflare-workers | Maximum performance |

## Status Types

- `idle` - Gray, clock icon
- `running` - Blue, animated spinner
- `success` - Green, checkmark
- `error` - Red, X icon
- `warning` - Yellow, alert

## Accessibility

WCAG 2.1 Level AA compliant with full keyboard navigation, screen reader support, and proper color contrast.

## Dependencies

- React 19+
- lucide-react (icons)
- Tailwind CSS

## Bundle Size

~14KB minified, ~4KB gzipped
