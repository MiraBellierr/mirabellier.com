import { useEffect, useRef, useState } from "react";
import { useWebSocket } from "@/states/WebSocketProvider";
import type { ConnectionState } from "@/lib/websocket";

export function useWebSocketEvent(
  type: string,
  callback: (data: unknown) => void,
) {
  const ws = useWebSocket();
  const callbackRef = useRef(callback);

  callbackRef.current = callback;

  useEffect(() => {
    const unsubscribe = ws.on(type, (data) => {
      callbackRef.current(data);
    });
    return unsubscribe;
  }, [ws, type]);
}

export function useWebSocketState(): ConnectionState {
  const ws = useWebSocket();
  const [connectionState, setConnectionState] = useState<ConnectionState>(
    ws.connectionState,
  );

  useEffect(() => {
    setConnectionState(ws.connectionState);
    return ws.onStateChange(setConnectionState);
  }, [ws]);

  return connectionState;
}
