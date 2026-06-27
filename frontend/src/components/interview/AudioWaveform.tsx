"use client";

import { useEffect, useRef } from "react";

interface AudioWaveformProps {
  audioLevel: number;  // 0-255
  isActive: boolean;
  isAgent?: boolean;
}

const BAR_COUNT = 32;

export function AudioWaveform({ audioLevel, isActive, isAgent = false }: AudioWaveformProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const frameRef = useRef<number>(0);
  const barsRef = useRef<number[]>(Array(BAR_COUNT).fill(0.1));

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const draw = () => {
      const w = canvas.width;
      const h = canvas.height;
      const barW = w / BAR_COUNT - 2;

      ctx.clearRect(0, 0, w, h);

      // Smooth bar heights toward target
      const target = isActive ? (audioLevel / 255) * 0.9 + 0.1 : 0.05;
      barsRef.current = barsRef.current.map((bar, i) => {
        const noise = isActive ? (Math.random() - 0.5) * 0.3 : 0;
        const t = target + noise;
        return bar + (Math.max(0.05, Math.min(1, t)) - bar) * 0.15;
      });

      // Draw gradient bars
      const grad = ctx.createLinearGradient(0, 0, 0, h);
      if (isAgent) {
        grad.addColorStop(0, "#818cf8");
        grad.addColorStop(1, "#4f46e5");
      } else {
        grad.addColorStop(0, "#34d399");
        grad.addColorStop(1, "#10b981");
      }
      ctx.fillStyle = grad;

      barsRef.current.forEach((bar, i) => {
        const barH = bar * h;
        const x = i * (barW + 2);
        const y = (h - barH) / 2;
        ctx.beginPath();
        ctx.roundRect(x, y, barW, barH, 2);
        ctx.fill();
      });

      frameRef.current = requestAnimationFrame(draw);
    };

    draw();
    return () => cancelAnimationFrame(frameRef.current);
  }, [audioLevel, isActive, isAgent]);

  return (
    <canvas
      ref={canvasRef}
      width={256}
      height={64}
      className="w-full h-16 opacity-90"
      aria-label={isActive ? "Audio waveform active" : "Audio inactive"}
    />
  );
}
