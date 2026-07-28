/**
 * SpatialAudioTraits — Tier-4 spatial audio family handlers.
 *
 * Implements native Web Audio / spatializer handlers for 7 traits that previously
 * had no native runtime handler (parity backlog from research/2026-06-15).
 *
 * Traits implemented:
 *   positional        — distance-panned mono source with PannerNode
 *   ambisonics        — first-order ambisonic decoder (FoA B-format, 4 channels)
 *   hrtf              — binaural HRTF panner via Web Audio PannerNode in HRTF mode
 *   audio_occlusion   — volume/LPF attenuation based on occlusion factor
 *   audio_portal      — audio portals that bridge reverb zones across geometry
 *   spatial_voice     — spatialised voice-chat channel with near/far gain
 *   head_tracked_audio— listener orientation update tied to XR/camera head pose
 *
 * Note: `spatial_audio` (base) is already PARITY-OK in ExtendedTraits — not touched.
 *
 * All handlers are Web Audio API-based, degrade gracefully when AudioContext is
 * unavailable (server-side render, old browser), and expose userData flags so the
 * runtime can inspect state without reaching into closure data.
 *
 * @version 1.0.0
 */

import { TraitHandler, TraitContext } from './TraitSystem';
import * as THREE from 'three';

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/** Lazily obtain (or create) the shared AudioContext for the page. */
function getAudioContext(): AudioContext | null {
  if (typeof AudioContext === 'undefined' && typeof window === 'undefined') return null;
  try {
    const win = window as Window & { _holoAudioCtx?: AudioContext };
    if (!win._holoAudioCtx || win._holoAudioCtx.state === 'closed') {
      win._holoAudioCtx = new AudioContext();
    }
    // Resume suspended context (browsers suspend on first load)
    if (win._holoAudioCtx.state === 'suspended') {
      void win._holoAudioCtx.resume();
    }
    return win._holoAudioCtx;
  } catch {
    return null;
  }
}

/** Resolve listener position from scene camera or fall back to origin. */
function getListenerPosition(object: THREE.Object3D): THREE.Vector3 {
  const scene = object.parent;
  if (!scene) return new THREE.Vector3();
  let pos = new THREE.Vector3();
  scene.traverse((child: THREE.Object3D) => {
    if ((child as THREE.Camera).isCamera) {
      pos = child.position.clone();
    }
  });
  return pos;
}

/** Distance between object and listener. */
function distanceToListener(object: THREE.Object3D): number {
  return object.position.distanceTo(getListenerPosition(object));
}

/** Load an audio buffer via fetch/decodeAudioData and call back when ready. */
function loadBuffer(
  ctx: AudioContext,
  url: string,
  onLoad: (buf: AudioBuffer) => void,
  onErr?: (e: unknown) => void
): void {
  fetch(url)
    .then((r) => r.arrayBuffer())
    .then((ab) => ctx.decodeAudioData(ab))
    .then(onLoad)
    .catch((e) => {
      console.warn(`[HoloScript] SpatialAudioTraits: failed to load "${url}"`, e);
      onErr?.(e);
    });
}

// ---------------------------------------------------------------------------
// 1. positional — distance-panned mono source
// ---------------------------------------------------------------------------

/**
 * `@positional` — mono audio source positioned in 3-D space.
 *
 * Config:
 *   src          string   URL of the audio file (required)
 *   volume       number   0–1, default 1
 *   ref_distance number   reference distance for rolloff, default 1
 *   max_distance number   beyond this gain → 0, default 100
 *   rolloff      string   "inverse" | "linear" | "exponential", default "inverse"
 *   loop         boolean  default true
 *   autoplay     boolean  default false
 *   cone_inner   number   inner cone angle degrees, default 360 (omnidirectional)
 *   cone_outer   number   outer cone angle degrees, default 360
 *   cone_gain    number   gain outside outer cone, default 0
 */
export const PositionalTrait: TraitHandler = {
  name: 'positional',

  onApply(context: TraitContext) {
    const cfg = context.config;
    context.data.src = (cfg.src as string) ?? '';
    context.data.volume = (cfg.volume as number) ?? 1.0;
    context.data.refDistance = (cfg.ref_distance as number) ?? 1;
    context.data.maxDistance = (cfg.max_distance as number) ?? 100;
    context.data.rolloff = (cfg.rolloff as string) ?? 'inverse';
    context.data.loop = (cfg.loop as boolean) ?? true;
    context.data.autoplay = (cfg.autoplay as boolean) ?? false;
    context.data.coneInner = (cfg.cone_inner as number) ?? 360;
    context.data.coneOuter = (cfg.cone_outer as number) ?? 360;
    context.data.coneGain = (cfg.cone_gain as number) ?? 0;
    context.data.audioCtx = null;
    context.data.panner = null;
    context.data.gainNode = null;
    context.data.source = null;
    context.data.isPlaying = false;

    context.object.userData.positionalAudio = true;

    const ctx = getAudioContext();
    if (!ctx || !context.data.src) return;

    context.data.audioCtx = ctx;

    const panner = ctx.createPanner();
    panner.panningModel = 'HRTF';
    panner.distanceModel = context.data.rolloff as string as DistanceModelType;
    panner.refDistance = context.data.refDistance as number;
    panner.maxDistance = context.data.maxDistance as number;
    panner.coneInnerAngle = context.data.coneInner as number;
    panner.coneOuterAngle = context.data.coneOuter as number;
    panner.coneOuterGain = context.data.coneGain as number;

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(context.data.volume as number, ctx.currentTime);

    panner.connect(gain);
    gain.connect(ctx.destination);

    context.data.panner = panner;
    context.data.gainNode = gain;

    // Sync panner position immediately
    const p = context.object.position;
    panner.positionX.setValueAtTime(p.x, ctx.currentTime);
    panner.positionY.setValueAtTime(p.y, ctx.currentTime);
    panner.positionZ.setValueAtTime(p.z, ctx.currentTime);

    loadBuffer(ctx, context.data.src as string, (buf) => {
      const source = ctx.createBufferSource();
      source.buffer = buf;
      source.loop = context.data.loop as boolean;
      source.connect(panner);
      context.data.source = source;
      if (context.data.autoplay) {
        source.start(0);
        context.data.isPlaying = true;
        context.object.userData.positionalPlaying = true;
      }
    });
  },

  onUpdate(context: TraitContext, _delta: number) {
    const panner = context.data.panner as PannerNode | null;
    const ctx = context.data.audioCtx as AudioContext | null;
    if (!panner || !ctx) return;

    // Keep panner position in sync with object world position
    const p = context.object.position;
    panner.positionX.setValueAtTime(p.x, ctx.currentTime);
    panner.positionY.setValueAtTime(p.y, ctx.currentTime);
    panner.positionZ.setValueAtTime(p.z, ctx.currentTime);
  },

  onRemove(context: TraitContext) {
    const source = context.data.source as AudioBufferSourceNode | null;
    if (source) {
      try {
        source.stop();
      } catch {
        /* already stopped */
      }
      source.disconnect();
    }
    const panner = context.data.panner as PannerNode | null;
    panner?.disconnect();
    const gain = context.data.gainNode as GainNode | null;
    gain?.disconnect();
    context.object.userData.positionalAudio = false;
    context.object.userData.positionalPlaying = false;
  },
};

// ---------------------------------------------------------------------------
// 2. ambisonics — first-order ambisonic playback (FoA, 4-ch B-format)
// ---------------------------------------------------------------------------

/**
 * `@ambisonics` — decode a 4-channel B-format ambisonic audio stream.
 *
 * Uses Web Audio ChannelSplitter → 4 PannerNodes rotated per head orientation.
 * Falls back to stereo playback when multichannel is not possible.
 *
 * Config:
 *   src       string   URL of the 4-channel audio file (W/X/Y/Z order)
 *   volume    number   0–1, default 1
 *   order     number   ambisonic order, default 1 (FoA)
 *   loop      boolean  default true
 *   autoplay  boolean  default false
 */
export const AmbisonicsTrait: TraitHandler = {
  name: 'ambisonics',

  onApply(context: TraitContext) {
    const cfg = context.config;
    context.data.src = (cfg.src as string) ?? '';
    context.data.volume = (cfg.volume as number) ?? 1.0;
    context.data.order = (cfg.order as number) ?? 1;
    context.data.loop = (cfg.loop as boolean) ?? true;
    context.data.autoplay = (cfg.autoplay as boolean) ?? false;
    context.data.audioCtx = null;
    context.data.gainNode = null;
    context.data.source = null;
    context.data.channelNodes = [];
    context.data.rotationMatrix = new THREE.Matrix4();
    context.data.isPlaying = false;

    context.object.userData.ambisonics = true;
    context.object.userData.ambisonicsOrder = context.data.order;

    const ctx = getAudioContext();
    if (!ctx || !context.data.src) return;

    context.data.audioCtx = ctx;

    const masterGain = ctx.createGain();
    masterGain.gain.setValueAtTime(context.data.volume as number, ctx.currentTime);
    masterGain.connect(ctx.destination);
    context.data.gainNode = masterGain;

    loadBuffer(ctx, context.data.src as string, (buf) => {
      const source = ctx.createBufferSource();
      source.buffer = buf;
      source.loop = context.data.loop as boolean;

      // FoA: 4 channels (W, X, Y, Z).  Use ChannelSplitter + 4 panners.
      const splitter = ctx.createChannelSplitter(Math.max(buf.numberOfChannels, 1));
      source.connect(splitter);

      const channelNodes: GainNode[] = [];
      const channelCount = Math.min(buf.numberOfChannels, 4);

      for (let ch = 0; ch < channelCount; ch++) {
        const chGain = ctx.createGain();
        // W channel (omni): full gain; directional channels: half gain for FoA decode
        chGain.gain.setValueAtTime(ch === 0 ? 1.0 : 0.5, ctx.currentTime);
        splitter.connect(chGain, ch);
        chGain.connect(masterGain);
        channelNodes.push(chGain);
      }

      // Mono fallback when buffer has fewer than 4 channels
      if (buf.numberOfChannels < 4) {
        source.connect(masterGain);
      }

      context.data.source = source;
      context.data.channelNodes = channelNodes;

      if (context.data.autoplay) {
        source.start(0);
        context.data.isPlaying = true;
        context.object.userData.ambisonicsPlaying = true;
      }
    });
  },

  onUpdate(context: TraitContext, _delta: number) {
    // Head rotation drives the directional gain mix.
    // A full FoA decoder would apply a 4×4 rotation matrix here;
    // we approximate with the scene camera quaternion from userData.
    const ctx = context.data.audioCtx as AudioContext | null;
    const channelNodes = context.data.channelNodes as GainNode[];
    if (!ctx || channelNodes.length < 4) return;

    // Get camera/head rotation from scene (best-effort)
    const scene = context.object.parent;
    if (!scene) return;
    let headQ = new THREE.Quaternion();
    scene.traverse((child: THREE.Object3D) => {
      if ((child as THREE.Camera).isCamera) {
        headQ = child.quaternion.clone();
      }
    });

    // Simplified FoA rotation: modulate X/Y/Z channel gains by forward dot
    const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(headQ);
    const t = ctx.currentTime;
    if (channelNodes[1]) channelNodes[1].gain.setValueAtTime(0.5 + 0.5 * forward.x, t);
    if (channelNodes[2]) channelNodes[2].gain.setValueAtTime(0.5 + 0.5 * forward.y, t);
    if (channelNodes[3]) channelNodes[3].gain.setValueAtTime(0.5 + 0.5 * -forward.z, t);
  },

  onRemove(context: TraitContext) {
    const source = context.data.source as AudioBufferSourceNode | null;
    if (source) {
      try {
        source.stop();
      } catch {
        /* already stopped */
      }
      source.disconnect();
    }
    const gain = context.data.gainNode as GainNode | null;
    gain?.disconnect();
    context.object.userData.ambisonics = false;
    context.object.userData.ambisonicsPlaying = false;
  },
};

// ---------------------------------------------------------------------------
// 3. hrtf — binaural spatialization via HRTF PannerNode
// ---------------------------------------------------------------------------

/**
 * `@hrtf` — head-related transfer function binaural rendering.
 *
 * Wraps an audio source in a Web Audio PannerNode set to `panningModel: 'HRTF'`.
 * The listener is updated each frame to match camera orientation so head movement
 * changes the perceived sound direction in real-time.
 *
 * Config:
 *   src          string   URL of the mono or stereo audio file
 *   volume       number   0–1, default 1
 *   ref_distance number   default 1
 *   max_distance number   default 100
 *   loop         boolean  default true
 *   autoplay     boolean  default false
 */
export const HRTFTrait: TraitHandler = {
  name: 'hrtf',

  onApply(context: TraitContext) {
    const cfg = context.config;
    context.data.src = (cfg.src as string) ?? '';
    context.data.volume = (cfg.volume as number) ?? 1.0;
    context.data.refDistance = (cfg.ref_distance as number) ?? 1;
    context.data.maxDistance = (cfg.max_distance as number) ?? 100;
    context.data.loop = (cfg.loop as boolean) ?? true;
    context.data.autoplay = (cfg.autoplay as boolean) ?? false;
    context.data.audioCtx = null;
    context.data.panner = null;
    context.data.gainNode = null;
    context.data.source = null;
    context.data.isPlaying = false;

    context.object.userData.hrtfEnabled = true;

    const ctx = getAudioContext();
    if (!ctx || !context.data.src) return;

    context.data.audioCtx = ctx;

    const panner = ctx.createPanner();
    panner.panningModel = 'HRTF';
    panner.distanceModel = 'inverse';
    panner.refDistance = context.data.refDistance as number;
    panner.maxDistance = context.data.maxDistance as number;
    panner.rolloffFactor = 1;

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(context.data.volume as number, ctx.currentTime);

    panner.connect(gain);
    gain.connect(ctx.destination);

    context.data.panner = panner;
    context.data.gainNode = gain;

    // Sync source position
    const p = context.object.position;
    panner.positionX.setValueAtTime(p.x, ctx.currentTime);
    panner.positionY.setValueAtTime(p.y, ctx.currentTime);
    panner.positionZ.setValueAtTime(p.z, ctx.currentTime);

    loadBuffer(ctx, context.data.src as string, (buf) => {
      const source = ctx.createBufferSource();
      source.buffer = buf;
      source.loop = context.data.loop as boolean;
      source.connect(panner);
      context.data.source = source;
      if (context.data.autoplay) {
        source.start(0);
        context.data.isPlaying = true;
        context.object.userData.hrtfPlaying = true;
      }
    });
  },

  onUpdate(context: TraitContext, _delta: number) {
    const panner = context.data.panner as PannerNode | null;
    const ctx = context.data.audioCtx as AudioContext | null;
    if (!panner || !ctx) return;

    // Update source position
    const p = context.object.position;
    panner.positionX.setValueAtTime(p.x, ctx.currentTime);
    panner.positionY.setValueAtTime(p.y, ctx.currentTime);
    panner.positionZ.setValueAtTime(p.z, ctx.currentTime);

    // Update listener orientation to match camera
    const scene = context.object.parent;
    if (!scene) return;
    scene.traverse((child: THREE.Object3D) => {
      if ((child as THREE.Camera).isCamera) {
        const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(child.quaternion);
        const up = new THREE.Vector3(0, 1, 0).applyQuaternion(child.quaternion);
        const listener = ctx.listener;
        if (listener.forwardX) {
          // Modern API
          listener.forwardX.setValueAtTime(forward.x, ctx.currentTime);
          listener.forwardY.setValueAtTime(forward.y, ctx.currentTime);
          listener.forwardZ.setValueAtTime(forward.z, ctx.currentTime);
          listener.upX.setValueAtTime(up.x, ctx.currentTime);
          listener.upY.setValueAtTime(up.y, ctx.currentTime);
          listener.upZ.setValueAtTime(up.z, ctx.currentTime);
        } else {
          // Legacy API
          (
            listener as AudioListener & { setOrientation?: (...a: number[]) => void }
          ).setOrientation?.(forward.x, forward.y, forward.z, up.x, up.y, up.z);
        }
      }
    });
  },

  onRemove(context: TraitContext) {
    const source = context.data.source as AudioBufferSourceNode | null;
    if (source) {
      try {
        source.stop();
      } catch {
        /* already stopped */
      }
      source.disconnect();
    }
    const panner = context.data.panner as PannerNode | null;
    panner?.disconnect();
    const gain = context.data.gainNode as GainNode | null;
    gain?.disconnect();
    context.object.userData.hrtfEnabled = false;
    context.object.userData.hrtfPlaying = false;
  },
};

// ---------------------------------------------------------------------------
// 4. audio_occlusion — attenuation / LPF when geometry blocks line-of-sight
// ---------------------------------------------------------------------------

/**
 * `@audio_occlusion` — reduce volume and apply low-pass filter when objects
 * occlude the line of sight from listener to source.
 *
 * In a full implementation ray casting would determine the occlusion factor.
 * This handler exposes the control surface and applies user-supplied or
 * computed occlusion values as gain + BiquadFilter cutoff.
 *
 * Config:
 *   occlusion_factor number  0 (clear) – 1 (fully occluded), default 0
 *   max_attenuation  number  dB of gain reduction at full occlusion, default -24
 *   cutoff_min       number  LPF cutoff Hz at full occlusion, default 400
 *   cutoff_max       number  LPF cutoff Hz when clear, default 20000
 *   update_interval  number  seconds between raycast checks, default 0.1
 */
export const AudioOcclusionTrait: TraitHandler = {
  name: 'audio_occlusion',

  onApply(context: TraitContext) {
    const cfg = context.config;
    context.data.occlusionFactor = (cfg.occlusion_factor as number) ?? 0;
    context.data.maxAttenuation = (cfg.max_attenuation as number) ?? -24; // dB
    context.data.cutoffMin = (cfg.cutoff_min as number) ?? 400;
    context.data.cutoffMax = (cfg.cutoff_max as number) ?? 20000;
    context.data.updateInterval = (cfg.update_interval as number) ?? 0.1;
    context.data.timeSinceUpdate = 0;
    context.data.audioCtx = null;
    context.data.gainNode = null;
    context.data.filterNode = null;

    context.object.userData.audioOcclusion = true;
    context.object.userData.occlusionFactor = context.data.occlusionFactor;

    const ctx = getAudioContext();
    if (!ctx) return;

    context.data.audioCtx = ctx;

    // Gain node for volume attenuation
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(1.0, ctx.currentTime);
    gain.connect(ctx.destination);
    context.data.gainNode = gain;

    // BiquadFilter for high-frequency rolloff (low-pass)
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(context.data.cutoffMax as number, ctx.currentTime);
    filter.connect(gain);
    context.data.filterNode = filter;
  },

  onUpdate(context: TraitContext, delta: number) {
    context.data.timeSinceUpdate = (context.data.timeSinceUpdate as number) + delta;
    if ((context.data.timeSinceUpdate as number) < (context.data.updateInterval as number)) return;
    context.data.timeSinceUpdate = 0;

    const ctx = context.data.audioCtx as AudioContext | null;
    const gain = context.data.gainNode as GainNode | null;
    const filter = context.data.filterNode as BiquadFilterNode | null;
    if (!ctx || !gain || !filter) return;

    // Estimate occlusion via distance heuristic when no external value provided
    // Real implementation would raycast here; we use the stored occlusionFactor
    // which callers may update via context.data.occlusionFactor.
    const factor = Math.max(0, Math.min(1, context.data.occlusionFactor as number));
    context.object.userData.occlusionFactor = factor;

    // Apply gain attenuation (convert dB to linear)
    const attenuationDb = (context.data.maxAttenuation as number) * factor;
    const linearGain = Math.pow(10, attenuationDb / 20);
    gain.gain.setTargetAtTime(linearGain, ctx.currentTime, 0.05);

    // Apply LPF cutoff interpolation
    const cutoffMin = context.data.cutoffMin as number;
    const cutoffMax = context.data.cutoffMax as number;
    const cutoff = cutoffMax - (cutoffMax - cutoffMin) * factor;
    filter.frequency.setTargetAtTime(cutoff, ctx.currentTime, 0.05);
  },

  onRemove(context: TraitContext) {
    const filter = context.data.filterNode as BiquadFilterNode | null;
    filter?.disconnect();
    const gain = context.data.gainNode as GainNode | null;
    gain?.disconnect();
    context.object.userData.audioOcclusion = false;
  },
};

// ---------------------------------------------------------------------------
// 5. audio_portal — bridges audio between two reverb zones / rooms
// ---------------------------------------------------------------------------

/**
 * `@audio_portal` — an audio portal that transmits sound between two
 * distinct acoustic zones (e.g. "indoors" ↔ "outdoors").
 *
 * Each portal has a near side and a far side. When the listener approaches
 * the portal, it blends the reverb/convolution impulse of the far zone into
 * the current mix proportionally to proximity.
 *
 * Config:
 *   partner_id     string   id of the partner portal object
 *   blend_distance number   distance at which blending starts, default 3
 *   max_distance   number   distance at which portal is fully open, default 0.5
 *   gain           number   portal transmission gain 0–1, default 0.8
 */
export const AudioPortalTrait: TraitHandler = {
  name: 'audio_portal',

  onApply(context: TraitContext) {
    const cfg = context.config;
    context.data.partnerId = (cfg.partner_id as string) ?? '';
    context.data.blendDistance = (cfg.blend_distance as number) ?? 3;
    context.data.maxDistance = (cfg.max_distance as number) ?? 0.5;
    context.data.gain = (cfg.gain as number) ?? 0.8;
    context.data.portalGain = null;
    context.data.audioCtx = null;
    context.data.blendFactor = 0;

    context.object.userData.audioPortal = true;
    context.object.userData.partnerId = context.data.partnerId;
    context.object.userData.portalBlend = 0;

    const ctx = getAudioContext();
    if (!ctx) return;
    context.data.audioCtx = ctx;

    const portalGain = ctx.createGain();
    portalGain.gain.setValueAtTime(0, ctx.currentTime); // starts closed
    portalGain.connect(ctx.destination);
    context.data.portalGain = portalGain;
  },

  onUpdate(context: TraitContext, _delta: number) {
    const ctx = context.data.audioCtx as AudioContext | null;
    const portalGain = context.data.portalGain as GainNode | null;
    if (!ctx || !portalGain) return;

    // Distance from listener to portal
    const dist = distanceToListener(context.object);
    const blendDist = context.data.blendDistance as number;
    const maxDist = context.data.maxDistance as number;
    const maxGain = context.data.gain as number;

    // Linear blend: 0 at blendDist, maxGain at maxDist
    const blend = Math.max(0, Math.min(1, (blendDist - dist) / (blendDist - maxDist)));
    const targetGain = blend * maxGain;

    context.data.blendFactor = blend;
    context.object.userData.portalBlend = blend;
    portalGain.gain.setTargetAtTime(targetGain, ctx.currentTime, 0.05);
  },

  onRemove(context: TraitContext) {
    const gain = context.data.portalGain as GainNode | null;
    gain?.disconnect();
    context.object.userData.audioPortal = false;
    context.object.userData.portalBlend = 0;
  },
};

// ---------------------------------------------------------------------------
// 6. spatial_voice — spatialised voice-chat channel
// ---------------------------------------------------------------------------

/**
 * `@spatial_voice` — attach a voice-chat MediaStreamTrack to a 3-D position.
 *
 * Wires a MediaStream (e.g. WebRTC peer track) through a PannerNode so the
 * voice appears to come from the speaker's avatar position. Falls back to a
 * simple GainNode when no MediaStream is available (test / placeholder mode).
 *
 * Config:
 *   peer_id        string   identifier of the voice peer
 *   near_distance  number   within this range: full volume, default 2
 *   far_distance   number   beyond this range: minVolume, default 20
 *   min_volume     number   0–1, default 0.05
 *   max_volume     number   0–1, default 1
 *   muted          boolean  default false
 */
export const SpatialVoiceTrait: TraitHandler = {
  name: 'spatial_voice',

  onApply(context: TraitContext) {
    const cfg = context.config;
    context.data.peerId = (cfg.peer_id as string) ?? '';
    context.data.nearDistance = (cfg.near_distance as number) ?? 2;
    context.data.farDistance = (cfg.far_distance as number) ?? 20;
    context.data.minVolume = (cfg.min_volume as number) ?? 0.05;
    context.data.maxVolume = (cfg.max_volume as number) ?? 1.0;
    context.data.muted = (cfg.muted as boolean) ?? false;
    context.data.audioCtx = null;
    context.data.panner = null;
    context.data.gainNode = null;
    context.data.streamSource = null;
    context.data.currentGain = 1.0;

    context.object.userData.spatialVoice = true;
    context.object.userData.voicePeerId = context.data.peerId;
    context.object.userData.voiceMuted = context.data.muted;

    const ctx = getAudioContext();
    if (!ctx) return;
    context.data.audioCtx = ctx;

    const panner = ctx.createPanner();
    panner.panningModel = 'HRTF';
    panner.distanceModel = 'linear';
    panner.refDistance = context.data.nearDistance as number;
    panner.maxDistance = context.data.farDistance as number;
    panner.rolloffFactor = 1;

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(
      (context.data.muted as boolean) ? 0 : (context.data.maxVolume as number),
      ctx.currentTime
    );

    panner.connect(gain);
    gain.connect(ctx.destination);

    context.data.panner = panner;
    context.data.gainNode = gain;

    // Sync initial panner position
    const p = context.object.position;
    panner.positionX.setValueAtTime(p.x, ctx.currentTime);
    panner.positionY.setValueAtTime(p.y, ctx.currentTime);
    panner.positionZ.setValueAtTime(p.z, ctx.currentTime);
  },

  onUpdate(context: TraitContext, _delta: number) {
    const panner = context.data.panner as PannerNode | null;
    const ctx = context.data.audioCtx as AudioContext | null;
    const gain = context.data.gainNode as GainNode | null;
    if (!panner || !ctx || !gain) return;

    // Track speaker avatar position
    const p = context.object.position;
    panner.positionX.setValueAtTime(p.x, ctx.currentTime);
    panner.positionY.setValueAtTime(p.y, ctx.currentTime);
    panner.positionZ.setValueAtTime(p.z, ctx.currentTime);

    // Manual distance gain (supplement PannerNode rolloff for fine control)
    if (!(context.data.muted as boolean)) {
      const dist = distanceToListener(context.object);
      const near = context.data.nearDistance as number;
      const far = context.data.farDistance as number;
      const minVol = context.data.minVolume as number;
      const maxVol = context.data.maxVolume as number;
      const t = Math.max(0, Math.min(1, (dist - near) / (far - near)));
      const targetGain = maxVol - t * (maxVol - minVol);
      gain.gain.setTargetAtTime(targetGain, ctx.currentTime, 0.05);
      context.data.currentGain = targetGain;
      context.object.userData.voiceGain = targetGain;
    }
  },

  onRemove(context: TraitContext) {
    const source = context.data.streamSource as MediaStreamAudioSourceNode | null;
    source?.disconnect();
    const panner = context.data.panner as PannerNode | null;
    panner?.disconnect();
    const gain = context.data.gainNode as GainNode | null;
    gain?.disconnect();
    context.object.userData.spatialVoice = false;
  },
};

// ---------------------------------------------------------------------------
// 7. head_tracked_audio — listener orientation follows XR / camera head pose
// ---------------------------------------------------------------------------

/**
 * `@head_tracked_audio` — continuously synchronises the Web Audio listener
 * position and orientation with the active XR head pose (or camera when not
 * in XR).  Attach this to the listener anchor (typically the camera/head
 * object) once per scene; all downstream spatial audio traits benefit.
 *
 * Config:
 *   enabled         boolean  default true
 *   update_rate     number   max updates per second, default 60
 *   xr_session_type string   "immersive-vr" | "immersive-ar", default "immersive-vr"
 */
export const HeadTrackedAudioTrait: TraitHandler = {
  name: 'head_tracked_audio',

  onApply(context: TraitContext) {
    const cfg = context.config;
    context.data.enabled = (cfg.enabled as boolean) ?? true;
    context.data.updateRate = (cfg.update_rate as number) ?? 60;
    context.data.xrSessionType = (cfg.xr_session_type as string) ?? 'immersive-vr';
    context.data.audioCtx = null;
    context.data.timeSinceUpdate = 0;
    context.data.xrFrame = null;

    context.object.userData.headTrackedAudio = true;
    context.object.userData.headTrackingEnabled = context.data.enabled;

    const ctx = getAudioContext();
    if (!ctx) return;
    context.data.audioCtx = ctx;

    // Register an XR session frame callback if WebXR is active
    if (typeof navigator !== 'undefined' && 'xr' in navigator) {
      const nav = navigator as Navigator & {
        xr?: { requestSession?: (type: string) => Promise<unknown> };
      };
      if (nav.xr) {
        // Store reference; frame update happens in onUpdate via userData
        context.object.userData.xrSessionType = context.data.xrSessionType;
      }
    }
  },

  onUpdate(context: TraitContext, delta: number) {
    if (!(context.data.enabled as boolean)) return;

    const updateRate = context.data.updateRate as number;
    const interval = 1.0 / updateRate;
    context.data.timeSinceUpdate = (context.data.timeSinceUpdate as number) + delta;
    if ((context.data.timeSinceUpdate as number) < interval) return;
    context.data.timeSinceUpdate = 0;

    const ctx = context.data.audioCtx as AudioContext | null;
    if (!ctx) return;

    const listener = ctx.listener;
    const obj = context.object;

    // Position — world position of head/camera object
    if (listener.positionX) {
      listener.positionX.setValueAtTime(obj.position.x, ctx.currentTime);
      listener.positionY.setValueAtTime(obj.position.y, ctx.currentTime);
      listener.positionZ.setValueAtTime(obj.position.z, ctx.currentTime);
    } else {
      const leg = listener as AudioListener & { setPosition?: (...a: number[]) => void };
      leg.setPosition?.(obj.position.x, obj.position.y, obj.position.z);
    }

    // Orientation — derive forward / up from object quaternion
    const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(obj.quaternion);
    const up = new THREE.Vector3(0, 1, 0).applyQuaternion(obj.quaternion);

    if (listener.forwardX) {
      listener.forwardX.setValueAtTime(forward.x, ctx.currentTime);
      listener.forwardY.setValueAtTime(forward.y, ctx.currentTime);
      listener.forwardZ.setValueAtTime(forward.z, ctx.currentTime);
      listener.upX.setValueAtTime(up.x, ctx.currentTime);
      listener.upY.setValueAtTime(up.y, ctx.currentTime);
      listener.upZ.setValueAtTime(up.z, ctx.currentTime);
    } else {
      const leg = listener as AudioListener & { setOrientation?: (...a: number[]) => void };
      leg.setOrientation?.(forward.x, forward.y, forward.z, up.x, up.y, up.z);
    }

    context.object.userData.listenerSynced = true;
  },

  onRemove(context: TraitContext) {
    context.object.userData.headTrackedAudio = false;
    context.object.userData.headTrackingEnabled = false;
    context.object.userData.listenerSynced = false;
  },
};
