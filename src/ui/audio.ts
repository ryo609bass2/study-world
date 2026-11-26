import { useEffect, useRef } from 'react';
import type { Settings } from '../app/settings.ts';

const notes = [261.63, 329.63, 392, 523.25, 392, 329.63, 293.66, 349.23];

function tone(ctx: AudioContext, frequency: number, start: number, duration: number, volume: number) {
  const oscillator = ctx.createOscillator(), gain = ctx.createGain();
  oscillator.frequency.value = frequency;
  gain.gain.setValueAtTime(0, start);
  gain.gain.linearRampToValueAtTime(volume, start + .035);
  gain.gain.exponentialRampToValueAtTime(.0001, start + duration);
  oscillator.connect(gain).connect(ctx.destination);
  oscillator.start(start);
  oscillator.stop(start + duration + .025);
  oscillator.onended = () => { oscillator.disconnect(); gain.disconnect(); };
}

export function useGameAudio(settings: Settings, playing: boolean) {
  const context = useRef<AudioContext | null>(null), index = useRef(0);
  useEffect(() => {
    const enable = () => {
      if (typeof AudioContext === 'undefined') return;
      try {
        context.current ??= new AudioContext();
        if (context.current.state === 'suspended') void context.current.resume().catch(() => {});
      } catch { /* 無音でも遊べます。 */ }
    };
    window.addEventListener('pointerdown', enable);
    window.addEventListener('keydown', enable);
    return () => {
      window.removeEventListener('pointerdown', enable);
      window.removeEventListener('keydown', enable);
      if (context.current) void context.current.close();
      context.current = null;
    };
  }, []);
  useEffect(() => {
    if (!playing || !settings.bgmVolume) return;
    const timer = setInterval(() => {
      const ctx = context.current;
      if (ctx?.state === 'running' && !document.hidden)
        tone(ctx, notes[index.current++ % notes.length], ctx.currentTime, .85, settings.bgmVolume * .00036);
    }, 950);
    return () => clearInterval(timer);
  }, [playing, settings.bgmVolume]);
  return (kind: 'gather' | 'build' | 'learn') => {
    const ctx = context.current;
    if (ctx?.state !== 'running' || !settings.seVolume) return;
    const melody = kind === 'learn' ? [392, 523.25, 659.25] : kind === 'build' ? [261.63, 392] : [330, 440];
    melody.forEach((note, i) => tone(ctx, note, ctx.currentTime + .1 * i, .38, settings.seVolume * .00065));
  };
}
