# @holoscript/snn-poc

> Standalone WebGPU compute shader proof-of-concept for LIF spiking neural network simulation with CPU reference validation.

## Overview

A proof-of-concept implementation of a Leaky Integrate-and-Fire (LIF) spiking neural network running entirely on WebGPU compute shaders. Includes a CPU reference implementation for validation and correctness testing.

## Architecture

```text
┌──────────────────────────────┐
│  WebGPU Compute Pipeline     │
│  ├── LIF Neuron Kernel       │
│  ├── Synapse Weight Update   │
│  └── Spike Propagation       │
└──────────────┬───────────────┘
               │ verify
               ▼
┌──────────────────────────────┐
│  CPU Reference               │
│  ├── Same LIF math           │
│  └── Bit-for-bit comparison  │
└──────────────────────────────┘
```

## Usage

```typescript
import { SNNSimulator } from '@holoscript/snn-poc';

const sim = new SNNSimulator({
  neurons: 1000,
  timestep: 0.001,
  backend: 'webgpu', // or 'cpu' for reference
});

await sim.step(100); // Run 100 timesteps
const spikes = sim.getSpikeHistory();
```

## Related

- [`@holoscript/snn-webgpu`](../snn-webgpu/) — Production SNN WebGPU pipeline
- [WebGPU Compiler](../core/src/compiler/WebGPUCompiler.ts)

## License

MIT
