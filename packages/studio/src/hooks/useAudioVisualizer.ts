'use client';

/**
 * useAudioVisualizer — Web Audio API + canvas FFT visualizer.
 * Creates an AnalyserNode, feeds from an OscillatorNode (demo) or mic,
 * and exposes per-frame frequency band data for canvas rendering.
 */

import { useEffect, useRef, useCallback, useState } from 'react';

export type VisualizerMode = 'bars' | 'waveform' | 'radial';

export interface AudioVisualizerState {
  isPlaying: boolean;
  mode: VisualizerMode;
  gain: number;
  fftSize: number;
  frequencyData: Uint8Array;
  waveformData: Uint8Array;
  canvasRef: React.RefObject<HTMLCanvasElement | null>;
  play: () => void;
  stop: () => void;
  setMode: (mode: VisualizerMode) => void;
  setGain: (g: number) => void;
}

export function useAudioVisualizer(): AudioVisualizerState {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const contextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const sourceRef = useRef<OscillatorNode | null>(null);
  const gainRef = useRef<GainNode | null>(null);
  const rafRef = useRef<number>(0);

  const [isPlaying, setIsPlaying] = useState(false);
  const [mode, setMode] = useState<VisualizerMode>('bars');
  const [gain, setGainValue] = useState(0.3);
  const [frequencyData, setFrequencyData] = useState<Uint8Array>(new Uint8Array(128));
  const [waveformData, setWaveformData] = useState<Uint8Array>(new Uint8Array(128));

  const draw = useCallback(() => {
    const analyser = analyserRef.current;
    const canvas = canvasRef.current;
    if (!analyser || !canvas) return;

    const freqArr = new Uint8Array(analyser.frequencyBinCount);
    const waveArr = new Uint8Array(analyser.frequencyBinCount);
    analyser.getByteFrequencyData(freqArr);
    analyser.getByteTimeDomainData(waveArr);
    setFrequencyData(new Uint8Array(freqArr));
    setWaveformData(new Uint8Array(waveArr));

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const { width, height } = canvas;
    ctx.clearRect(0, 0, width, height);

    if (mode === 'bars') {
      const barW = width / freqArr.length;
      for (let i = 0; i < freqArr.length; i++) {
        const v = freqArr[i] / 255;
        const h = v * height;
        const hue = (i / freqArr.length) * 240 + 180;
        ctx.fillStyle = `hsla(${hue}, 80%, 55%, 0.85)`;
        ctx.fillRect(i * barW, height - h, barW - 1, h);
      }
    } else if (mode === 'waveform') {
      ctx.strokeStyle = '#7c6fff';
      ctx.lineWidth = 2;
      ctx.beginPath();
      const sliceW = width / waveArr.length;
      let x = 0;
      for (let i = 0; i < waveArr.length; i++) {
        const v = waveArr[i] / 128.0;
        const y = (v * height) / 2;
        i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
        x += sliceW;
      }
      ctx.lineTo(width, height / 2);
      ctx.stroke();
    } else {
      // radial
      const cx = width / 2,
        cy = height / 2;
      const r = Math.min(cx, cy) * 0.5;
      for (let i = 0; i < freqArr.length; i++) {
        const angle = (i / freqArr.length) * Math.PI * 2;
        const amp = (freqArr[i] / 255) * r * 0.8;
        const x1 = cx + Math.cos(angle) * r;
        const y1 = cy + Math.sin(angle) * r;
        const x2 = cx + Math.cos(angle) * (r + amp);
        const y2 = cy + Math.sin(angle) * (r + amp);
        const hue = (i / freqArr.length) * 360;
        ctx.strokeStyle = `hsla(${hue}, 80%, 65%, 0.8)`;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(x1, y1);
        ctx.lineTo(x2, y2);
        ctx.stroke();
      }
    }

    rafRef.current = requestAnimationFrame(draw);
  }, [mode]);

  const play = useCallback(() => {
    if (contextRef.current) {
      contextRef.current.close();
    }
    const ctx = new AudioContext();
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 256;
    const gain = ctx.createGain();
    gain.gain.value = 0.3;
    const osc = ctx.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.value = 220;
    // Create a more interesting waveform via second osc
    const osc2 = ctx.createOscillator();
    osc2.type = 'sine';
    osc2.frequency.value = 440;
    osc.connect(gain);
    osc2.connect(gain);
    gain.connect(analyser);
    analyser.connect(ctx.destination);
    osc.start();
    osc2.start();
    contextRef.current = ctx;
    analyserRef.current = analyser;
    gainRef.current = gain;
    sourceRef.current = osc;
    setIsPlaying(true);
    rafRef.current = requestAnimationFrame(draw);
  }, [draw]);

  const stop = useCallback(() => {
    cancelAnimationFrame(rafRef.current);
    contextRef.current?.close();
    contextRef.current = null;
    setIsPlaying(false);
  }, []);

  const setGain = useCallback((g: number) => {
    setGainValue(g);
    if (gainRef.current) gainRef.current.gain.value = g;
  }, []);

  useEffect(
    () => () => {
      cancelAnimationFrame(rafRef.current);
      contextRef.current?.close();
    },
    []
  );

  return {
    isPlaying,
    mode,
    gain,
    fftSize: 256,
    frequencyData,
    waveformData,
    canvasRef,
    play,
    stop,
    setMode,
    setGain,
  };
}
