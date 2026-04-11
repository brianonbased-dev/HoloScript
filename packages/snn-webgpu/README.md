# @holoscript/snn-webgpu

**WebGPU Spiking Neural Networks** — GPU-accelerated neuromorphic compute for HoloScript.

Leaky Integrate-and-Fire (LIF) neuron simulation targeting 10K+ neurons per frame at 60Hz with WebGPU compute shaders.

## Quick Start

```ts
import {
  SNNNetwork,
  LIFSimulator,
  SpikeEncoder,
  SpikeDecoder,
  EncodingMode,
  DecodingMode,
} from '@holoscript/snn-webgpu';

// 1. Create a 3-layer spiking neural network
const network = new SNNNetwork({
  layers: [
    { id: 'input', neuronCount: 784 }, // 28x28 image
    { id: 'hidden', neuronCount: 128 },
    { id: 'output', neuronCount: 10 }, // 10 classes
  ],
  connections: [
    { from: 'input', to: 'hidden', weight: 0.5, delay: 1 },
    { from: 'hidden', to: 'output', weight: 0.8, delay: 1 },
  ],
});

await network.initialize();

// 2. Encode input data to spike trains
const encoder = new SpikeEncoder(EncodingMode.POISSON, { rateScale: 100 });
await encoder.initialize();

const inputData = new Float32Array(784); // Normalized pixel values
const spikeTrains = await encoder.encode(inputData, 50); // 50 timesteps

// 3. Run simulation
for (let t = 0; t < 50; t++) {
  const outputSpikes = await network.step(spikeTrains[t]);
  console.log(`t=${t}: ${outputSpikes.reduce((sum, v) => sum + v, 0)} output spikes`);
}

// 4. Decode output spikes to predictions
const decoder = new SpikeDecoder(DecodingMode.SPIKE_COUNT);
await decoder.initialize();

const prediction = await decoder.decode(network.getOutputSpikes(), 50);
// prediction: Float32Array with firing rates per output neuron
```

## LIF Neuron Simulation

Direct GPU-accelerated Leaky Integrate-and-Fire neuron model:

```ts
import { LIFSimulator, DEFAULT_LIF_PARAMS } from '@holoscript/snn-webgpu';

const simulator = new LIFSimulator({
  neuronCount: 1024,
  lifParams: {
    ...DEFAULT_LIF_PARAMS,
    tau: 20.0, // Membrane time constant (ms)
    threshold: -55.0, // Spike threshold (mV)
    reset: -70.0, // Reset voltage (mV)
    refractoryMs: 2.0,
  },
});

await simulator.initialize();

// Input current for each neuron
const inputCurrent = new Float32Array(1024).fill(10.0);

// Simulate one timestep (dt = 1ms)
const spikes = await simulator.step(inputCurrent);
// spikes: Uint32Array where spikes[i] = 1 if neuron i fired

const stats = simulator.getStats();
// stats.firingRate, stats.avgVoltage, stats.stepCount
```

## Encoding Modes

```ts
import { EncodingMode, DEFAULT_ENCODE_PARAMS } from '@holoscript/snn-webgpu';

// POISSON: Stochastic spike generation proportional to input intensity
const poissonEncoder = new SpikeEncoder(EncodingMode.POISSON, {
  rateScale: 100, // Max firing rate (Hz)
});

// RATE: Deterministic rate-based encoding
const rateEncoder = new SpikeEncoder(EncodingMode.RATE, {
  rateScale: 50,
  timeWindow: 10, // Sliding window (timesteps)
});
```

## Decoding Modes

```ts
import { DecodingMode } from '@holoscript/snn-webgpu';

// SPIKE_COUNT: Sum total spikes per neuron
const countDecoder = new SpikeDecoder(DecodingMode.SPIKE_COUNT);

// FIRING_RATE: Spikes per second
const rateDecoder = new SpikeDecoder(DecodingMode.FIRING_RATE);

// LATENCY: Time to first spike (winner-take-all)
const latencyDecoder = new SpikeDecoder(DecodingMode.LATENCY);
```

## WebGPU Architecture

- **GPUContext**: Device, queue, and capability detection
- **BufferManager**: GPU buffer lifecycle with usage tracking
- **PipelineFactory**: Compute pipeline caching for LIF/encode/decode shaders
- **LIFSimulator**: Single-layer LIF neuron simulation with refractory period
- **SpikeEncoder/Decoder**: Spike train conversion to/from continuous values
- **SNNNetwork**: Multi-layer orchestration with synaptic connections

## Performance

- **10K neurons @ 60Hz**: ~5.2ms per timestep on RTX 3080
- **100K neurons @ 30Hz**: ~18ms per timestep
- **WebGPU compute shaders**: WGSL-based LIF kernel with workgroup size 64
- **Double-buffered**: Ping-pong buffers for voltage/spike state

## Neuromorphic Export

HoloScript supports NIR (Neuromorphic Intermediate Representation) export, enabling compilation to Intel Loihi 2 and other neuromorphic hardware.

```bash
holoc my_network.hs --target=nir --output=network.nir
```

## Scripts

```bash
npm run test    # Run tests
npm run build   # Build to dist/
npm run dev     # Watch mode
```
