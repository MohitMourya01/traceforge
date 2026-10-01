/**
 * useWebSocket — subscribes to the backend WebSocket and
 * calls onMessage whenever a JSON message arrives.
 * Returns { wsRef, sendMessage } for bi-directional communication.
 */
import { useEffect, useRef, useCallback } from 'react';

const WS_URL = 'ws://127.0.0.1:7890/ws/studio';

export function useWebSocket(onMessage) {
  const wsRef   = useRef(null);
  const timerRef = useRef(null);
  const mountedRef = useRef(true);

  const connect = useCallback(() => {
    if (!mountedRef.current) return;
    try {
      const ws = new WebSocket(WS_URL);
      wsRef.current = ws;

      ws.onopen    = () => onMessage({ type: '__WS_OPEN__' });
      ws.onclose   = () => {
        onMessage({ type: '__WS_CLOSE__' });
        if (mountedRef.current) timerRef.current = setTimeout(connect, 3000);
      };
      ws.onerror   = () => ws.close();
      ws.onmessage = (e) => {
        try { onMessage(JSON.parse(e.data)); }
        catch { /* ignore malformed */ }
      };
    } catch { /* ignore */ }
  }, [onMessage]);

  const sendMessage = useCallback((msg) => {
    try {
      if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
        wsRef.current.send(typeof msg === 'string' ? msg : JSON.stringify(msg));
        return true;
      }
    } catch (_) {}
    return false;
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    connect();
    return () => {
      mountedRef.current = false;
      clearTimeout(timerRef.current);
      wsRef.current?.close();
    };
  }, [connect]);

  return { wsRef, sendMessage };
}
