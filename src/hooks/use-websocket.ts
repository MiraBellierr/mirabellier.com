import { useEffect, useRef } from "react";
import { useWebSocket } from "@/states/WebSocketProvider";

export function useWebSocketEvent(
  type: string,
  callback: (data: unknown) => void,
) {
  const ws = useWebSocket();
  const callbackRef = useRef(callback);

  useEffect(() => {
    callbackRef.current = callback;
  }, [callback]);

  useEffect(() => {
    const unsubscribe = ws.on(type, (data) => {
      callbackRef.current(data);
    });
    return unsubscribe;
  }, [ws, type]);
}
