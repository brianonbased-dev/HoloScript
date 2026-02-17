# Render Network Trait

> Part of the HoloScript Traits reference. Browse: [Web3](/traits/web3) · [Advanced](/traits/advanced) · [All Traits](/traits/)

The `@render_network` trait connects an object to the **Render Network** — a decentralized GPU rendering grid powered by RNDR tokens. Use it to offload photorealistic rendering, volumetric captures, and Gaussian Splat baking to thousands of distributed nodes.

## Quick Start

```hsplus
composition "Studio Shot" {
  object "Camera" @render_network(api_key: env.RENDER_API_KEY) {
    position: [0, 1.6, 0]
  }
}
```

When a `render_submit` event fires, the trait authenticates with the Render Network, submits the job, and streams progress events back. On completion, signed output URLs are emitted via `render_job_complete`.

---

## Configuration

```hsplus
object "RenderCam" @render_network(
  api_key: "rndr_...",
  wallet_address: "0x...",
  default_quality: "production",
  default_engine: "cycles",
  default_priority: "normal",
  max_concurrent_jobs: 3
) { }
```

| Config                 | Type   | Default        | Description                                               |
| ---------------------- | ------ | -------------- | --------------------------------------------------------- |
| `api_key`              | string | `""`           | **Required.** Render Network API key.                     |
| `wallet_address`       | string | `""`           | Ethereum wallet for RNDR credit balance.                  |
| `default_quality`      | string | `"preview"`    | `"preview"`, `"standard"`, `"production"`, `"cinematic"` |
| `default_engine`       | string | `"auto"`       | `"auto"`, `"cycles"`, `"eevee"`, `"vray"`, `"arnold"`   |
| `default_priority`     | string | `"normal"`     | `"draft"`, `"normal"`, `"high"`, `"urgent"`              |
| `max_concurrent_jobs`  | number | `5`            | Max simultaneously active jobs.                           |
| `auto_download`        | bool   | `true`         | Automatically download outputs when complete.             |
| `output_path`          | string | `"./renders/"` | Local path for downloaded outputs.                        |

---

## Events

### Incoming (trigger via `emit`)

| Event             | Payload                                                                           | Description                       |
| ----------------- | --------------------------------------------------------------------------------- | --------------------------------- |
| `render_submit`   | `{ scene, quality?, engine?, priority?, frames? }`                                | Submit a render job.              |
| `cancel_job`      | `{ job_id }`                                                                      | Cancel an active job.             |
| `refresh_credits` | `{}`                                                                              | Refresh RNDR credit balance.      |

### Outgoing (listen via `on_event`)

| Event                  | Payload                                                    | Description                   |
| ---------------------- | ---------------------------------------------------------- | ----------------------------- |
| `render_job_submitted` | `{ job, estimatedWait }`                                   | Job accepted by the network.  |
| `render_job_progress`  | `{ job, progress, framesCompleted }`                       | Fired every 5 s while active. |
| `render_job_complete`  | `{ job }` — `job.outputs[]` contains signed download URLs | Job finished successfully.    |
| `render_job_failed`    | `{ job, error }`                                           | Job failed on the network.    |
| `render_job_cancelled` | `{ job }`                                                  | Job cancelled by user.        |
| `credits_refreshed`    | `{ credits }`                                             | Balance update received.      |

---

## Usage Examples

### Submit a Still Frame

```hsplus
logic {
  on_ready() {
    emit "render_submit" {
      scene: "MainScene",
      quality: "production",
      engine: "cycles",
      frames: { start: 0, end: 0 }
    }
  }

  on_event("render_job_complete", event) {
    log("Render done:", event.job.outputs[0].url)
  }
}
```

### Track Progress with a UI Panel

```hsplus
object "ProgressPanel" @ui_panel {
  width: 400
  height: 80
  text: "Idle"
}

logic {
  on_event("render_job_progress", event) {
    ProgressPanel.text = `Rendering… ${event.progress}%  (${event.framesCompleted} frames done)`
  }

  on_event("render_job_complete", event) {
    ProgressPanel.text = "Complete! Output ready."
  }
}
```

### Cancel a Job

```hsplus
object "CancelButton" @clickable {
  on_click: {
    emit "cancel_job" { job_id: state.currentJobId }
  }
}
```

---

## Credit System

RNDR credits are deducted per GPU-hour. The trait tracks:

- `credits.balance` — spendable RNDR balance
- `credits.pending` — credits reserved for active jobs
- `credits.spent` — total spent this session
- `credits.earned` — total earned (if running a render node)

Emit `refresh_credits` to force a balance update from the API.

---

## Development Mode

When no `api_key` is provided, the trait automatically falls back to **simulation mode** — a local progress ticker that completes jobs in ~5 seconds. Useful for UI development without burning RNDR credits.

---

## See Also

- [Web3 Traits](/traits/web3)
- [ZoraCoins Trait](/traits/web3#zora-coins)
- [API Reference](/api/)
