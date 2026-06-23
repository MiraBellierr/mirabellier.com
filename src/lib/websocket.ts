import { API_BASE } from "./config";

export type ConnectionState = "connecting" | "connected" | "disconnected";

type EventCallback = (data: unknown) => void;

const RECONNECT_BASE_MS = 1000;
const RECONNECT_MAX_MS = 30000;
const RECONNECT_MULTIPLIER = 1.5;

export interface WebSocketClient {
  get connectionState(): ConnectionState;
  send(data: Record<string, unknown>): void;
  on(type: string, callback: EventCallback): () => void;
  off(type: string, callback: EventCallback): void;
  onStateChange(callback: (state: ConnectionState) => void): () => void;
  close(): void;
}

function resolveWsUrl(): string {
  if (typeof window === "undefined") return "";

  const host = window.location.hostname;
  if (host.includes("mirabellier.com")) {
    return `wss://api.mirabellier.com/ws`;
  }
  return `ws://localhost:3000/ws`;
}

async function fetchWsToken(): Promise<string> {
  const res = await fetch(`${API_BASE}/auth/ws-token`, {
    method: "POST",
    credentials: "include",
  });
  if (!res.ok) throw new Error("Failed to get WebSocket token");
  const data = (await res.json()) as { token: string };
  return data.token;
}

export function createWebSocketClient(): WebSocketClient {
  let state: ConnectionState = "disconnected";
  let ws: WebSocket | null = null;
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  let reconnectAttempt = 0;
  let closed = false;

  const listeners = new Map<string, Set<EventCallback>>();
  const stateListeners = new Set<(state: ConnectionState) => void>();

  function setState(next: ConnectionState) {
    if (state === next) return;
    state = next;
    for (const cb of stateListeners) cb(state);
  }

  function clearReconnect() {
    if (reconnectTimer !== null) {
      clearTimeout(reconnectTimer);
      reconnectTimer = null;
    }
  }

  function scheduleReconnect() {
    if (closed) return;
    clearReconnect();
    const delay = Math.min(
      RECONNECT_BASE_MS * Math.pow(RECONNECT_MULTIPLIER, reconnectAttempt),
      RECONNECT_MAX_MS,
    );
    reconnectTimer = setTimeout(() => {
      reconnectTimer = null;
      reconnectAttempt++;
      void connect();
    }, delay);
  }

  async function connect() {
    if (closed) return;
    clearReconnect();

    try {
      const token = await fetchWsToken();
      if (closed) return;

      const url = `${resolveWsUrl()}?token=${encodeURIComponent(token)}`;
      ws = new WebSocket(url);

      ws.onopen = () => {
        setState("connected");
        reconnectAttempt = 0;
      };

      ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data as string) as { type: string; data: unknown };
          const cbs = listeners.get(msg.type);
          if (cbs) {
            for (const cb of cbs) cb(msg.data);
          }
        } catch {
          // ignore malformed messages
        }
      };

      ws.onclose = () => {
        ws = null;
        setState("disconnected");
        scheduleReconnect();
      };

      ws.onerror = () => {
        // onclose will fire after this
      };
    } catch {
      setState("disconnected");
      scheduleReconnect();
    }
  }

  return {
    get connectionState() {
      return state;
    },

    send(data: Record<string, unknown>) {
      if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify(data));
      }
    },

    on(type: string, callback: EventCallback): () => void {
      if (!listeners.has(type)) listeners.set(type, new Set());
      const cbs = listeners.get(type)!;
      cbs.add(callback);
      const isFirst = cbs.size === 1;

      if (isFirst && state === "disconnected" && !closed) {
        void connect();
      }

      return () => {
        cbs.delete(callback);
        if (cbs.size === 0) listeners.delete(type);
      };
    },

    off(type: string, callback: EventCallback) {
      const cbs = listeners.get(type);
      if (cbs) {
        cbs.delete(callback);
        if (cbs.size === 0) listeners.delete(type);
      }
    },

    onStateChange(callback: (state: ConnectionState) => void): () => void {
      stateListeners.add(callback);
      return () => {
        stateListeners.delete(callback);
      };
    },

    close() {
      closed = true;
      clearReconnect();
      if (ws) {
        ws.onopen = null;
        ws.onmessage = null;
        ws.onclose = null;
        ws.onerror = null;
        ws.close();
        ws = null;
      }
      listeners.clear();
    },
  };
}

let defaultClient: WebSocketClient | null = null;

export function getWebSocketClient(): WebSocketClient {
  if (!defaultClient) {
    defaultClient = createWebSocketClient();
  }
  return defaultClient;
}
