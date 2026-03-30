'use client';

import { useRef, useState } from 'react';
import { Music, Play, Pause, Volume2, VolumeX } from 'lucide-react';

interface MusicPlayerProps {
  url: string;
  volume: number;
  themeColor: string;
}

export function MusicPlayer({ url, volume, themeColor }: MusicPlayerProps) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);
  const [muted, setMuted] = useState(false);

  if (!url) return null;

  const toggle = () => {
    if (!audioRef.current) return;
    if (playing) {
      audioRef.current.pause();
    } else {
      audioRef.current.volume = volume;
      audioRef.current.play().catch(() => {});
    }
    setPlaying(!playing);
  };

  const toggleMute = () => {
    if (!audioRef.current) return;
    audioRef.current.muted = !muted;
    setMuted(!muted);
  };

  return (
    <div
      className="fixed bottom-4 right-4 z-50 flex items-center gap-2 rounded-full border border-white/10 bg-black/70 backdrop-blur-sm px-3 py-2 shadow-lg"
      style={{ borderColor: themeColor + '30' }}
    >
      <audio ref={audioRef} src={url} loop preload="none" />
      <Music className="h-3.5 w-3.5 text-white/40" />
      <button
        onClick={toggle}
        className="flex items-center justify-center rounded-full p-1 transition hover:bg-white/10"
        aria-label={playing ? 'Pause music' : 'Play music'}
      >
        {playing ? (
          <Pause className="h-3.5 w-3.5" style={{ color: themeColor }} />
        ) : (
          <Play className="h-3.5 w-3.5 text-white/60" />
        )}
      </button>
      <button
        onClick={toggleMute}
        className="flex items-center justify-center rounded-full p-1 transition hover:bg-white/10"
        aria-label={muted ? 'Unmute' : 'Mute'}
      >
        {muted ? (
          <VolumeX className="h-3 w-3 text-white/30" />
        ) : (
          <Volume2 className="h-3 w-3 text-white/40" />
        )}
      </button>
    </div>
  );
}
