"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { WSEvent } from "@/lib/types";

const WS_URL = process.env.NEXT_PUBLIC_WS_URL || "ws://localhost:8000";

export type WSStatus = "connecting" | "open" | "closed" | "error";

interface UseWebSocketOptions {
  sessionId: string;
  onMessage: (event: WSEvent) => void;
  onStatusChange?: (status: WSStatus) => void;
}

export function useWebSocket({ sessionId, onMessage, onStatusChange }: UseWebSocketOptions) {
  const wsRef = useRef<WebSocket | null>(null);
  const [status, setStatus] = useState<WSStatus>("connecting");

  // Stable refs so callbacks never trigger effect re-runs
  const onMessageRef = useRef(onMessage);
  const onStatusChangeRef = useRef(onStatusChange);
  useEffect(() => { onMessageRef.current = onMessage; }, [onMessage]);
  useEffect(() => { onStatusChangeRef.current = onStatusChange; }, [onStatusChange]);

  const reconnectCount = useRef(0);
  const pingInterval = useRef<ReturnType<typeof setInterval> | null>(null);
  const reconnectTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mounted = useRef(true);

  const changeStatus = useCallback((s: WSStatus) => {
    setStatus(s);
    onStatusChangeRef.current?.(s);
  }, []);

  const connect = useCallback(() => {
    if (!mounted.current) return;
    if (wsRef.current && wsRef.current.readyState <= WebSocket.OPEN) return; // already connecting/open

    changeStatus("connecting");
    const ws = new WebSocket(`${WS_URL}/ws/${sessionId}`);
    wsRef.current = ws;

    ws.onopen = () => {
      if (!mounted.current) { ws.close(); return; }
      changeStatus("open");
      reconnectCount.current = 0;

      pingInterval.current = setInterval(() => {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ type: "ping" }));
        }
      }, 25_000);
    };

    ws.onmessage = (e) => {
      try {
        const event = JSON.parse(e.data as string) as WSEvent;
        if (event.type !== "pong") onMessageRef.current(event);
      } catch {
        console.error("[WS] parse error", e.data);
      }
    };

    ws.onclose = (e) => {
      clearInterval(pingInterval.current ?? undefined);
      pingInterval.current = null;

      if (!mounted.current) return;

      // 1000 = normal close (session ended / server clean shutdown) — don't retry
      if (e.code === 1000 || e.code === 1001) {
        changeStatus("closed");
        return;
      }

      changeStatus("error");

      if (reconnectCount.current >= 5) return;

      // Exponential backoff: 1 s, 2 s, 4 s, 8 s, 16 s
      const delay = Math.min(1000 * 2 ** reconnectCount.current, 16_000);
      reconnectCount.current++;
      console.info(`[WS] reconnecting in ${delay}ms (attempt ${reconnectCount.current}/5)`);

      reconnectTimer.current = setTimeout(() => {
        if (mounted.current) connect();
      }, delay);
    };

    ws.onerror = () => {
      // onerror always fires before onclose — let onclose handle the retry
    };
  }, [sessionId, changeStatus]); // stable: no onMessage dep here

  const send = useCallback((msg: Record<string, unknown>) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(msg));
    }
  }, []);

  const disconnect = useCallback(() => {
    mounted.current = false;
    clearTimeout(reconnectTimer.current ?? undefined);
    clearInterval(pingInterval.current ?? undefined);
    wsRef.current?.close(1000, "user disconnect");
  }, []);

  // Connect once on mount; sessionId changes = remount anyway
  useEffect(() => {
    mounted.current = true;
    reconnectCount.current = 0;
    connect();

    return () => {
      mounted.current = false;
      clearTimeout(reconnectTimer.current ?? undefined);
      clearInterval(pingInterval.current ?? undefined);
      wsRef.current?.close(1000, "cleanup");
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId]); // only re-run when session changes, not when connect() ref changes

  return { status, send, disconnect };
}
