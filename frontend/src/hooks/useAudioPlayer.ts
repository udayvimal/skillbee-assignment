"use client";

import { useCallback, useRef, useState } from "react";

/**
 * Unified sequential audio queue.
 *
 * Every speak() call — whether base64 MP3 or browser TTS fallback — is pushed
 * onto a single FIFO queue and played one at a time.  Nothing is ever
 * cancelled by a subsequent event arriving.  The previous design called
 * speechSynthesis.cancel() in speakText(), which cut off the intro / question
 * whenever the next WS event arrived milliseconds later.
 */

type AudioItem =
  | { type: "mp3";    b64:  string; onDone?: () => void }
  | { type: "speech"; text: string; onDone?: () => void };

export function useAudioPlayer() {
  const [isPlaying, setIsPlaying] = useState(false);
  const audioRef   = useRef<HTMLAudioElement | null>(null);
  const queueRef   = useRef<AudioItem[]>([]);
  const busyRef    = useRef(false); // true while an item is actively playing

  const playNext = useCallback(() => {
    const item = queueRef.current.shift();

    if (!item) {
      busyRef.current = false;
      setIsPlaying(false);
      return;
    }

    busyRef.current = true;
    setIsPlaying(true);

    const advance = () => {
      item.onDone?.();
      playNext();
    };

    if (item.type === "mp3") {
      const audio = new Audio(`data:audio/mp3;base64,${item.b64}`);
      audioRef.current = audio;
      audio.onended = advance;
      audio.onerror = advance;
      audio.play().catch(advance);
      return;
    }

    // Browser TTS fallback — NO cancel(), just enqueue
    if (typeof window === "undefined" || !window.speechSynthesis) {
      advance();
      return;
    }
    const utt  = new SpeechSynthesisUtterance(item.text);
    utt.rate   = 1.0;
    utt.pitch  = 1.0;
    utt.lang   = "en-US";
    utt.onend  = advance;
    utt.onerror = advance;
    window.speechSynthesis.speak(utt);
  }, []);

  /** Enqueue a base64 MP3.  Starts immediately if idle. */
  const play = useCallback(
    (b64: string, onDone?: () => void) => {
      queueRef.current.push({ type: "mp3", b64, onDone });
      if (!busyRef.current) playNext();
    },
    [playNext]
  );

  /** Enqueue browser TTS.  Starts immediately if idle.  Never cancels. */
  const speakText = useCallback(
    (text: string, onDone?: () => void) => {
      queueRef.current.push({ type: "speech", text, onDone });
      if (!busyRef.current) playNext();
    },
    [playNext]
  );

  /** Hard stop — used when user clicks "Start Speaking". */
  const stop = useCallback(() => {
    queueRef.current = [];
    audioRef.current?.pause();
    audioRef.current = null;
    window.speechSynthesis?.cancel();
    busyRef.current = false;
    setIsPlaying(false);
  }, []);

  /**
   * Awaitable version: resolves when the audio item finishes playing.
   * If `b64` is present, plays MP3; otherwise falls back to browser TTS.
   */
  const playAsync = useCallback(
    (b64: string | null | undefined, fallbackText: string): Promise<void> =>
      new Promise<void>((resolve) => {
        if (b64) play(b64, resolve);
        else speakText(fallbackText, resolve);
      }),
    [play, speakText]
  );

  return { isPlaying, play, speakText, stop, playAsync };
}
