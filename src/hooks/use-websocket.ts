import { useEffect } from "react";
import { useWebSocket } from "@/states/WebSocketProvider";

export function useWebSocketEvent(
  type: string,
  callback: (data: unknown) => void,
) {
  const ws = useWebSocket();

  useEffect(() => {
    const unsubscribe = ws.on(type, callback);
    return unsubscribe;
  }, [ws, type, callback]);
}
