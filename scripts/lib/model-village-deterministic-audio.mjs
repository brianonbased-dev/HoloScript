import { createHash } from 'node:crypto';

function canonicalJson(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`)
      .join(',')}}`;
  }
  return JSON.stringify(value);
}

export function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

function properties(node) {
  return Object.fromEntries((node.properties ?? []).map(({ key, value }) => [key, value]));
}

export function soundscapeFromAst(ast) {
  const state = properties(ast.state);
  const sources = (ast.audio ?? []).map((audio) => ({
    id: audio.name,
    ...properties(audio),
  }));
  return {
    metadata: ast.metadata,
    environment: ast.environment,
    state,
    sources,
    contractSha256: sha256(canonicalJson({
      metadata: ast.metadata,
      environment: ast.environment,
      state,
      sources,
      objects: (ast.objects ?? []).map((object) => ({
        name: object.name,
        properties: properties(object),
        traits: object.traits ?? [],
      })),
    })),
  };
}

function seededRandom(seed) {
  let value = seed >>> 0;
  return () => {
    value ^= value << 13;
    value ^= value >>> 17;
    value ^= value << 5;
    return (value >>> 0) / 4294967296;
  };
}

function envelope(time, duration, attack = 0.015, release = 0.12) {
  const attackGain = Math.min(1, time / Math.max(attack, Number.EPSILON));
  const releaseGain = Math.min(1, (duration - time) / Math.max(release, Number.EPSILON));
  return Math.max(0, Math.min(attackGain, releaseGain));
}

function addTone(buffer, sampleRate, startSeconds, durationSeconds, frequency, gain) {
  const start = Math.max(0, Math.round(startSeconds * sampleRate));
  const end = Math.min(buffer.length, Math.round((startSeconds + durationSeconds) * sampleRate));
  for (let index = start; index < end; index += 1) {
    const localTime = (index - start) / sampleRate;
    const env = envelope(localTime, durationSeconds, 0.006, Math.min(1.4, durationSeconds * 0.55));
    buffer[index] += Math.sin(2 * Math.PI * frequency * localTime) * gain * env;
  }
}

function renderRain(source, output, random) {
  let slow = 0;
  for (let index = 0; index < output.length; index += 1) {
    const white = random() * 2 - 1;
    slow = slow * 0.91 + white * 0.09;
    const shimmer = (random() * 2 - 1) * 0.16;
    output[index] = slow * 0.55 + shimmer;
  }
  const rate = source.sampleRateHz;
  for (let second = 0; second < source.durationMs / 1000; second += 0.27) {
    if (random() > 0.58) {
      addTone(output, rate, second + random() * 0.12, 0.032, 1700 + random() * 2600, 0.16);
    }
  }
}

function renderWater(source, output, random) {
  const rate = source.sampleRateHz;
  const interval = 1 / source.dropRateHz;
  for (let second = 0.18; second < source.durationMs / 1000; second += interval) {
    const frequency = source.fundamentalHz * (0.82 + random() * 0.42);
    addTone(output, rate, second + random() * 0.11, 0.42, frequency, 0.48);
    addTone(output, rate, second + 0.016, 0.29, frequency * 2.01, 0.19);
  }
  for (let index = 0; index < output.length; index += 1) {
    output[index] += (random() * 2 - 1) * 0.018;
  }
}

function renderHearth(source, output, random) {
  const duration = source.durationMs / 1000;
  for (let index = 0; index < output.length; index += 1) {
    const time = index / source.sampleRateHz;
    const breathe = 0.75 + 0.25 * Math.sin(2 * Math.PI * 0.17 * time);
    const drift = (random() * 2 - 1) * 0.006;
    output[index] = envelope(time, duration, 1.2, 1.2) * breathe * (
      Math.sin(2 * Math.PI * source.fundamentalHz * time) * 0.34
      + Math.sin(2 * Math.PI * source.harmonicTwoHz * time) * 0.13
      + Math.sin(2 * Math.PI * source.harmonicThreeHz * time) * 0.06
      + drift
    );
  }
}

function renderWard(source, output, random) {
  const duration = source.durationMs / 1000;
  for (let index = 0; index < output.length; index += 1) {
    const time = index / source.sampleRateHz;
    const pulse = 0.42 + 0.22 * Math.sin(2 * Math.PI * source.pulseRateHz * time);
    const air = (random() * 2 - 1) * 0.07;
    const tonal = Math.sin(2 * Math.PI * source.centerFrequencyHz * time) * 0.09;
    output[index] = envelope(time, duration, 0.7, 1.1) * pulse * (air + tonal);
  }
}

function renderChimes(source, output, random) {
  const tones = [source.toneAHz, source.toneBHz, source.toneCHz];
  const starts = [0.42, 2.15, 4.7];
  tones.forEach((tone, index) => {
    const offset = ((source.tokenStep + index * 17) % 31) / 1000;
    addTone(output, source.sampleRateHz, starts[index] + offset, 2.7, tone, 0.42);
    addTone(output, source.sampleRateHz, starts[index] + offset, 1.7, tone * 2.004, 0.16);
  });
  for (let index = 0; index < output.length; index += 1) {
    output[index] += (random() * 2 - 1) * 0.002;
  }
}

function renderResolve(source, output) {
  const duration = source.durationMs / 1000;
  const tones = [source.toneAHz, source.toneBHz, source.toneCHz];
  for (let index = 0; index < output.length; index += 1) {
    const time = index / source.sampleRateHz;
    const open = Math.min(1, time / 1.7);
    const close = Math.min(1, (duration - time) / 2.4);
    const env = Math.max(0, Math.min(open, close));
    output[index] = env * tones.reduce(
      (sum, tone, toneIndex) =>
        sum + Math.sin(2 * Math.PI * tone * time) * [0.17, 0.13, 0.09][toneIndex],
      0
    );
  }
}

export function renderSourcePcm(source) {
  const frameCount = Math.round(source.durationMs * source.sampleRateHz / 1000);
  const output = new Float32Array(frameCount);
  const random = seededRandom(source.synthesisSeed);
  const renderers = {
    seeded_band_limited_rain: renderRain,
    seeded_water_drops_and_resonance: renderWater,
    additive_hearth_hum: renderHearth,
    seeded_violet_ward_air: renderWard,
    sealed_gravity_token_chimes: renderChimes,
    hearthlight_resolve_chord: renderResolve,
  };
  const renderer = renderers[source.synthesisRecipe];
  if (!renderer) throw new Error(`Unsupported HoloScript synthesis recipe: ${source.synthesisRecipe}`);
  renderer(source, output, random);
  let peak = 0;
  for (const sample of output) peak = Math.max(peak, Math.abs(sample));
  if (peak > 0.96) {
    const scale = 0.96 / peak;
    for (let index = 0; index < output.length; index += 1) output[index] *= scale;
  }
  return output;
}

export function floatToPcm16(samples) {
  const output = Buffer.allocUnsafe(samples.length * 2);
  for (let index = 0; index < samples.length; index += 1) {
    const value = Math.max(-1, Math.min(1, samples[index]));
    output.writeInt16LE(Math.round(value < 0 ? value * 32768 : value * 32767), index * 2);
  }
  return output;
}

export function encodeWav(samples, sampleRate, channels) {
  const pcm = floatToPcm16(samples);
  const output = Buffer.alloc(44 + pcm.length);
  output.write('RIFF', 0, 'ascii');
  output.writeUInt32LE(output.length - 8, 4);
  output.write('WAVE', 8, 'ascii');
  output.write('fmt ', 12, 'ascii');
  output.writeUInt32LE(16, 16);
  output.writeUInt16LE(1, 20);
  output.writeUInt16LE(channels, 22);
  output.writeUInt32LE(sampleRate, 24);
  output.writeUInt32LE(sampleRate * channels * 2, 28);
  output.writeUInt16LE(channels * 2, 32);
  output.writeUInt16LE(16, 34);
  output.write('data', 36, 'ascii');
  output.writeUInt32LE(pcm.length, 40);
  pcm.copy(output, 44);
  return output;
}

export function renderMaster(soundscape, renderedSources) {
  const { sampleRateHz, channelCount, sequenceDurationMs, masterGainDefault } = soundscape.state;
  if (channelCount !== 2) throw new Error('MV-S2 deterministic renderer requires stereo');
  const frameCount = Math.round(sequenceDurationMs * sampleRateHz / 1000);
  const output = new Float32Array(frameCount * 2);
  for (const source of soundscape.sources) {
    const mono = renderedSources.get(source.id);
    if (!mono) throw new Error(`Missing rendered source ${source.id}`);
    const startFrame = Math.round(source.startMs * sampleRateHz / 1000);
    const endFrame = Math.min(frameCount, Math.round(source.endMs * sampleRateHz / 1000));
    const x = Array.isArray(source.position) ? Number(source.position[0]) : 0;
    const z = Array.isArray(source.position) ? Number(source.position[2]) : 0;
    const pan = source.spatial ? Math.max(-1, Math.min(1, x / 6)) : 0;
    const leftPan = Math.cos((pan + 1) * Math.PI / 4);
    const rightPan = Math.sin((pan + 1) * Math.PI / 4);
    const distance = Math.sqrt(x * x + z * z);
    const distanceGain = source.spatial ? 1 / (1 + distance * 0.055) : 1;
    // `volume` is the HoloScript compiler's authoritative linear playback gain.
    // `gainDb` documents the mix bus target; multiplying both would attenuate
    // every source twice and diverge from the live Web Audio/Godot lowering.
    const sourceGain = Number(source.volume) * distanceGain;
    for (let frame = startFrame; frame < endFrame; frame += 1) {
      const sourceIndex = frame - startFrame;
      if (!source.loop && sourceIndex >= mono.length) break;
      const sample = mono[sourceIndex % mono.length] * sourceGain;
      output[frame * 2] += sample * leftPan;
      output[frame * 2 + 1] += sample * rightPan;
    }
  }
  const ceiling = 10 ** (-1 / 20);
  for (let index = 0; index < output.length; index += 1) {
    output[index] = Math.max(-ceiling, Math.min(ceiling, output[index] * masterGainDefault));
  }
  return output;
}

export function materializeSoundscape(soundscape) {
  const renderedSources = new Map(
    soundscape.sources.map((source) => [source.id, renderSourcePcm(source)])
  );
  const sourceAssets = soundscape.sources.map((source) => {
    const pcm = renderedSources.get(source.id);
    const wav = encodeWav(pcm, source.sampleRateHz, 1);
    return {
      id: source.id,
      path: `docs/assets/${source.source}`,
      recipe: source.synthesisRecipe,
      seed: source.synthesisSeed,
      durationMs: source.durationMs,
      sampleRateHz: source.sampleRateHz,
      channels: 1,
      pcmSha256: sha256(floatToPcm16(pcm)),
      wavSha256: sha256(wav),
      wav,
    };
  });
  const master = renderMaster(soundscape, renderedSources);
  const masterPcm = floatToPcm16(master);
  const masterWav = encodeWav(master, soundscape.state.sampleRateHz, 2);
  return {
    sourceAssets,
    master: {
      path: 'docs/assets/model-village/stormglass-weather-in-the-light-master.wav',
      durationMs: soundscape.state.sequenceDurationMs,
      sampleRateHz: soundscape.state.sampleRateHz,
      channels: 2,
      pcmSha256: sha256(masterPcm),
      wavSha256: sha256(masterWav),
      wav: masterWav,
    },
    assetManifestSha256: sha256(canonicalJson({
      sources: sourceAssets.map(({ wav, ...asset }) => asset),
      master: {
        path: 'docs/assets/model-village/stormglass-weather-in-the-light-master.wav',
        durationMs: soundscape.state.sequenceDurationMs,
        sampleRateHz: soundscape.state.sampleRateHz,
        channels: 2,
        pcmSha256: sha256(masterPcm),
        wavSha256: sha256(masterWav),
      },
    })),
  };
}
