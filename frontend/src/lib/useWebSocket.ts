import { useEffect, useRef, useState } from 'react';
import { useAuth } from '../store/auth';

export type WSEvent = {
  event: string;
  data: any;
  timestamp?: string;
};

function getWebSocketUrl(token: string): string {
  const envApi = import.meta.env.VITE_API_URL;

  // 1. If explicit absolute API URL is configured (e.g. https://repohub-api.onrender.com or https://repohub-api.onrender.com/api/v1)
  if (envApi && (envApi.startsWith('http://') || envApi.startsWith('https://'))) {
    const wsBase = envApi.replace(/^http/, 'ws').replace(/\/+$/, '');
    if (wsBase.endsWith('/api/v1')) {
      return `${wsBase}/ws?token=${encodeURIComponent(token)}`;
    }
    return `${wsBase}/api/v1/ws?token=${encodeURIComponent(token)}`;
  }

  // 2. Browser window fallback
  if (typeof window !== 'undefined') {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const hostname = window.location.hostname;

    // In local dev with Vite on port 5173 without proxy, default directly to backend port 8000
    if (window.location.port === '5173' || hostname === 'localhost' || hostname === '127.0.0.1') {
      return `${protocol}//${hostname}:8000/api/v1/ws?token=${encodeURIComponent(token)}`;
    }

    // Auto-detect Render deployment
    if (hostname.endsWith('.onrender.com')) {
      const apiHost = hostname.replace(/-web(?=\.onrender\.com$)/, '-api');
      return `wss://${apiHost}/api/v1/ws?token=${encodeURIComponent(token)}`;
    }

    const host = window.location.host;
    return `${protocol}//${host}/api/v1/ws?token=${encodeURIComponent(token)}`;
  }

  return `ws://localhost:8000/api/v1/ws?token=${encodeURIComponent(token)}`;
}

export function useWebSocket() {
  const token = useAuth(s => s.accessToken);
  const [isConnected, setIsConnected] = useState(false);
  const [lastEvent, setLastEvent] = useState<WSEvent | null>(null);

  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<number | null>(null);
  const retryCountRef = useRef<number>(0);
  const isPageHiddenRef = useRef<boolean>(false);

  useEffect(() => {
    if (!token) {
      if (wsRef.current) {
        wsRef.current.close();
      }
      setIsConnected(false);
      return;
    }

    const wsUrl = getWebSocketUrl(token);

    function connect() {
      if (isPageHiddenRef.current) return;
      if (wsRef.current && (wsRef.current.readyState === WebSocket.OPEN || wsRef.current.readyState === WebSocket.CONNECTING)) {
        return;
      }

      try {
        const ws = new WebSocket(wsUrl);
        wsRef.current = ws;

        ws.onopen = () => {
          setIsConnected(true);
          retryCountRef.current = 0;
          const pingInterval = window.setInterval(() => {
            if (ws.readyState === WebSocket.OPEN) {
              ws.send('ping');
            }
          }, 20000);
          (ws as any)._pingInterval = pingInterval;
        };

        ws.onmessage = (event) => {
          if (event.data === 'pong') return;
          try {
            const parsed: WSEvent = JSON.parse(event.data);
            setLastEvent(parsed);
          } catch (e) {
            // Non-JSON message
          }
        };

        ws.onclose = () => {
          setIsConnected(false);
          if ((ws as any)._pingInterval) {
            clearInterval((ws as any)._pingInterval);
          }
          if (!isPageHiddenRef.current && useAuth.getState().accessToken) {
            retryCountRef.current += 1;
            const delay = Math.min(15000, 1000 * Math.pow(1.5, Math.min(retryCountRef.current, 8)));
            reconnectTimeoutRef.current = window.setTimeout(() => {
              connect();
            }, delay);
          }
        };

        ws.onerror = () => {
          try {
            ws.close();
          } catch (e) {
            // ignore
          }
        };
      } catch (err) {
        setIsConnected(false);
      }
    }

    // Handle Back-Forward Cache (BFCache) and visibility changes gracefully
    const handlePageHide = () => {
      isPageHiddenRef.current = true;
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
      if (wsRef.current) {
        try {
          wsRef.current.close(1000, 'Page hidden');
        } catch (e) {
          // ignore
        }
      }
    };

    const handlePageShow = () => {
      isPageHiddenRef.current = false;
      connect();
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden') {
        handlePageHide();
      } else if (document.visibilityState === 'visible') {
        handlePageShow();
      }
    };

    window.addEventListener('pagehide', handlePageHide);
    window.addEventListener('pageshow', handlePageShow);
    document.addEventListener('visibilitychange', handleVisibilityChange);

    connect();

    return () => {
      window.removeEventListener('pagehide', handlePageHide);
      window.removeEventListener('pageshow', handlePageShow);
      document.removeEventListener('visibilitychange', handleVisibilityChange);

      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
      if (wsRef.current) {
        if ((wsRef.current as any)._pingInterval) {
          clearInterval((wsRef.current as any)._pingInterval);
        }
        try {
          wsRef.current.close();
        } catch (e) {
          // ignore
        }
      }
    };
  }, [token]);

  return { isConnected, lastEvent };
}
