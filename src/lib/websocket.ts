import { io, type Socket } from "socket.io-client";
import { API_BASE } from "./config";

export type ConnectionState = "connecting" | "connected" | "disconnected";

type EventCallback = (data: unknown) => void;

const MAX_QUEUED_MESSAGES = 50;

export interface WebSocketClient {
  get connectionState(): ConnectionState;
  get isClosed(): boolean;
  send(data: Record<string, unknown>): boolean;
  sendWhenReady(data: Record<string, unknown>): boolean;
  on(type: string, callback: EventCallback): () => void;
  off(type: string, callback: EventCallback): void;
  onStateChange(callback: (state: ConnectionState) => void): () => void;
  close(): void;
}

function resolveApiUrl(): string {
  if (typeof window === "undefined") return "";

  const host = window.location.hostname;
  if (host.includes("mirabellier.com")) {
    return "https://api.mirabellier.com";
  }
  // In development, connect through Vite proxy (empty string = current origin)
  return "";
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
  let socket: Socket | null = null;
  let closed = false;
  let connectCalled = false;
  const queuedMessages: Record<string, unknown>[] = [];

  const listeners = new Map<string, Set<EventCallback>>();
  const stateListeners = new Set<(state: ConnectionState) => void>();

  function setState(next: ConnectionState) {
    if (state === next) return;
    state = next;
    for (const cb of stateListeners) cb(state);
  }

  function ensureSocket() {
    if (socket || closed) return socket;

    socket = io(resolveApiUrl(), {
      path: "/ws",
      autoConnect: false,
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 30000,
      reconnectionAttempts: Infinity,
      transports: ["websocket"],
      auth: (cb: (data: object) => void) => {
        fetchWsToken()
          .then((token) => cb({ token }))
          .catch(() => cb({ token: "" }));
      },
    });

    socket.on("connect", () => {
      if (socket?.connected) {
        setState("connected");
        flushQueue();
      }
    });

    socket.on("disconnect", () => {
      setState("disconnected");
    });

    socket.on("connect_error", () => {
      setState("disconnected");
    });

    socket.on("message", (msg: { type: string; data: unknown }) => {
      if (msg && typeof msg.type === "string") {
        const cbs = listeners.get(msg.type);
        if (cbs) {
          for (const cb of cbs) cb(msg.data);
        }
      }
    });

    return socket;
  }

  function flushQueue() {
    while (queuedMessages.length > 0 && socket?.connected) {
      const data = queuedMessages.shift();
      if (!data) continue;
      socket.emit("message", data);
    }
  }

  function triggerConnect() {
    if (closed || connectCalled) return;
    const s = ensureSocket();
    if (!s) return;
    connectCalled = true;
    setState("connecting");
    s.connect();
  }

  return {
    get connectionState() {
      return state;
    },

    get isClosed() {
      return closed;
    },

    send(data: Record<string, unknown>) {
      if (!socket?.connected) return false;
      socket.emit("message", data);
      return true;
    },

    sendWhenReady(data: Record<string, unknown>) {
      if (closed) return false;
      if (socket?.connected) {
        socket.emit("message", data);
        return true;
      }
      ensureSocket();
      if (queuedMessages.length >= MAX_QUEUED_MESSAGES) {
        queuedMessages.shift();
      }
      queuedMessages.push(data);
      if (!connectCalled) {
        triggerConnect();
      }
      return true;
    },

    on(type: string, callback: EventCallback): () => void {
      if (!listeners.has(type)) listeners.set(type, new Set());
      const cbs = listeners.get(type)!;
      cbs.add(callback);
      const isFirst = cbs.size === 1;

      if (isFirst && !connectCalled && !closed) {
        triggerConnect();
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
      connectCalled = false;
      queuedMessages.length = 0;
      if (socket) {
        socket.disconnect();
        socket.removeAllListeners();
        socket = null;
      }
      listeners.clear();
      stateListeners.clear();
      setState("disconnected");
    },
  };
}

export function createDedicatedSocket(): Socket {
  return io(resolveApiUrl(), {
    path: "/ws",
    autoConnect: false,
    reconnection: true,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 30000,
    reconnectionAttempts: Infinity,
    transports: ["websocket"],
    auth: (cb: (data: object) => void) => {
      fetchWsToken()
        .then((token) => cb({ token }))
        .catch(() => cb({ token: "" }));
    },
  });
}

let defaultClient: WebSocketClient | null = null;

export function getWebSocketClient(): WebSocketClient {
  if (!defaultClient || defaultClient.isClosed) {
    defaultClient = createWebSocketClient();
  }
  return defaultClient;
}
