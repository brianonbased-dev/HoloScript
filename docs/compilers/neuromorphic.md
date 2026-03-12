# Neuromorphic Compiler (NIR)

Compiles HoloScript to **Neuromorphic Intermediate Representation (NIR)** — enabling HoloScript spatial scenes to run on neuromorphic hardware chips and WebGPU-based Spiking Neural Network simulations.

## Overview

Neuromorphic computing processes information using networks of artificial neurons that fire spikes — like biological brains — instead of traditional floating-point operations. It offers extreme energy efficiency for pattern recognition, sensory processing, and autonomous decision-making.

HoloScript has two neuromorphic output targets:

| Compiler       | Target              | Output              |
| -------------- | ------------------- | ------------------- |
| `NIRCompiler`  | Physical chips      | NIR JSON + bitfile  |
| `NIRToWGSL`    | Browser (WebGPU)    | WGSL compute shader |

```bash
# Compile to neuromorphic chip (Intel Loihi2)
holoscript compile snn.holo --target nir --nir-backend loihi2 --output ./chip/

# Compile to WebGPU SNN simulation (browser)
holoscript compile snn.holo --target nir-wgsl --output ./web/
```

## Supported Hardware

| Backend      | Chip              | Organization          |
| ------------ | ----------------- | --------------------- |
| `loihi2`     | Intel Loihi 2     | Intel Labs            |
| `spinnaker`  | SpiNNaker 2       | University of Manchester |
| `synsense`   | Xylo / Speck      | SynSense AG           |

The `nir-wgsl` backend runs the same SNN model in a WebGPU compute shader — no hardware required, runs in any WebGPU-capable browser.

## LIF Neuron Model

HoloScript uses the **Leaky Integrate-and-Fire (LIF)** neuron as the default model:

```holo
composition "SpatialSNN" {
  template "Neuron" {
    @physics         // membrane dynamics
    state {
      membrane_potential: -70.0   // mV
      threshold:         -55.0    // mV
      resting_potential: -70.0    // mV
      time_constant:      20.0    // ms
    }
  }

  spatial_group "SensoryLayer" {
    object "N1" using "Neuron" { position: [0, 0, 0] }
    object "N2" using "Neuron" { position: [1, 0, 0] }
    object "N3" using "Neuron" { position: [2, 0, 0] }
  }

  logic {
    // Spike propagation: N1 fires → N2 → N3
    on_spike("N1") {
      N2.membrane_potential += 15.0
    }
    on_spike("N2") {
      N3.membrane_potential += 15.0
    }
  }
}
```

## NIR JSON Output

The NIR compiler produces a JSON graph consumable by chip SDKs:

```json
{
  "neurons": [
    { "id": "N1", "type": "LIF", "tau_m": 20, "v_thresh": -55, "v_reset": -70 },
    { "id": "N2", "type": "LIF", "tau_m": 20, "v_thresh": -55, "v_reset": -70 }
  ],
  "synapses": [
    { "pre": "N1", "post": "N2", "weight": 1.0, "delay": 1 }
  ],
  "inputs": ["N1"],
  "outputs": ["N3"]
}
```

## WebGPU SNN (Browser)

The `nir-wgsl` pipeline simulates the SNN in a WebGPU compute shader — enabling real-time neuromorphic inference in the browser alongside the spatial scene:

```bash
holoscript compile snn.holo --target nir-wgsl
# → snn.compute.wgsl (runs on GPU as compute shader)
# → snn-bridge.js   (connects spike outputs to scene objects)
```

This is backed by `@holoscript/snn-poc` and `@holoscript/snn-webgpu` packages.

## Use Cases

- **Energy-efficient NPCs** — AI agents that process sensory input on Loihi2 at milliwatt power
- **Spatial pattern recognition** — neuromorphic vision on AR glasses
- **Human-in-the-loop** — `@biofeedback` trait connects biological signals to SNN inputs
- **Research** — visual scene editor for neuroscience SNN experiments
- **Edge AI** — robotics + IoT devices using SpiNNaker

## Related Packages

| Package                  | Role                                |
| ------------------------ | ----------------------------------- |
| `@holoscript/snn-poc`    | Reference LIF implementation + tests |
| `@holoscript/snn-webgpu` | GPU-accelerated SNN compute shaders |

## Compiler Options

| Option              | Default   | Description                           |
| ------------------- | --------- | ------------------------------------- |
| `--nir-backend`     | `wgsl`    | `loihi2`, `spinnaker`, `synsense`, `wgsl` |
| `--nir-timestep`    | `1.0`     | Simulation timestep in ms             |
| `--nir-duration`    | `100`     | Default sim duration in ms            |
| `--nir-dt`          | `0.1`     | Integration step for continuous model |

## See Also

- [TSL Compiler](/compilers/tsl) — WGSL shader pipeline (shared format)
- [WASM Compiler](/compilers/wasm) — For compute-heavy non-neural workloads
- [AI & Behavior Traits](/traits/ai-behavior) — `@llm_agent`, `@state_machine`
