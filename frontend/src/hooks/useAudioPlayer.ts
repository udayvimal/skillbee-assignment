"use client";

import { useCallback, useRef, useState } from "react";

type AudioItem =
  | { type: "mp3";    b64:  string; onDone?: () => void }
  | { type: "speech"; text: string; onDone?: () => void };

export function useAudioPlayer() {
  const [isPlaying, setIsPlaying] = useState(false);
  const audioRef          = useRef<HTMLAudioElement | null>(null);
  const queueRef          = useRef<AudioItem[]>([]);
  const busyRef           = useRef(false);
  const pendingResolveRef = useRef<(() => void) | null>(null); // current playAsync resolve
  const stoppedEarlyRef   = useRef(false);                     // was the last playAsync force-stopped?

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

    if (typeof window === "undefined" || !window.speechSynthesis) {
      advance();
      return;
    }
    const utt   = new SpeechSynthesisUtterance(item.text);
    utt.rate    = 1.0;
    utt.pitch   = 1.0;
    utt.lang    = "en-US";
    utt.onend   = advance;
    utt.onerror = advance;
    window.speechSynthesis.speak(utt);
  }, []);

  const play = useCallback(
    (b64: string, onDone?: () => void) => {
      queueRef.current.push({ type: "mp3", b64, onDone });
      if (!busyRef.current) playNext();
    },
    [playNext]
  );

  const speakText = useCallback(
    (text: string, onDone?: () => void) => {
      queueRef.current.push({ type: "speech", text, onDone });
      if (!busyRef.current) playNext();
    },
    [playNext]
  );

  /**
   * Hard stop — clears queue, pauses audio, resolves any pending playAsync()
   * Promise so the task queue is never left deadlocked.
   */
  const stop = useCallback(() => {
    stoppedEarlyRef.current = true;
    queueRef.current = [];
    audioRef.current?.pause();
    audioRef.current = null;
    window.speechSynthesis?.cancel();
    busyRef.current = false;
    setIsPlaying(false);
    // Unblock the awaiting playAsync() call, if any, so runQueue() can exit cleanly
    const resolve = pendingResolveRef.current;
    pendingResolveRef.current = null;
    resolve?.();
  }, []);

  /**
   * Awaitable version — resolves when audio finishes naturally OR when stop() is called.
   * After stop(), call wasStopped() to distinguish the two cases.
   */
  const playAsync = useCallback(
    (b64: string | null | undefined, fallbackText: string): Promise<void> => {
      stoppedEarlyRef.current = false;
      return new Promise<void>((resolve) => {
        pendingResolveRef.current = resolve;
        const done = () => {
          pendingResolveRef.current = null;
          resolve();
        };
        if (b64) play(b64, done);
        else speakText(fallbackText, done);
      });
    },
    [play, speakText]
  );

  /** Returns true if the last playAsync() was ended early by stop(), not naturally. */
  const wasStopped = useCallback(() => stoppedEarlyRef.current, []);

  return { isPlaying, play, speakText, stop, playAsync, wasStopped };
}
