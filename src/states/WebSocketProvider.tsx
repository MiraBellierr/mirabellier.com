import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import {
  getWebSocketClient,
  type WebSocketClient,
} from "@/lib/websocket";

const WebSocketCtx = createContext<WebSocketClient | null>(null);

export function WebSocketProvider({ children }: { children: ReactNode }) {
  const [client] = useState(() => getWebSocketClient());

  useEffect(() => {
    return () => {
      client.close();
    };
  }, [client]);

  return (
    <WebSocketCtx.Provider value={client}>
      {children}
    </WebSocketCtx.Provider>
  );
}

export function useWebSocket(): WebSocketClient {
  const client = useContext(WebSocketCtx);
  if (!client) {
    throw new Error("useWebSocket must be used within a WebSocketProvider");
  }
  return client;
}
