const crypto = require("crypto");
const { Server } = require("socket.io");
const S2C = require("./websocket-events").S2C;
const { DEV_ORIGINS, devOriginsEnabled } = require("./dev-origins");

/** @type {ReturnType<typeof makeSocketIoManager> | null} */
let instance = null;

function makeSocketIoManager(io, { db, handleMessage }) {
  // track connected user IDs
  const connectedUsers = new Set();

  // in-memory token store: token → { userId, expiresAt }
  const wsTokens = new Map();

  function createWsToken(userId) {
    const token = crypto.randomBytes(32).toString("hex");
    wsTokens.set(token, { userId, expiresAt: Date.now() + 60000 });
    return token;
  }

  function validateWsToken(token) {
    const entry = wsTokens.get(token);
    if (!entry) return null;
    if (Date.now() > entry.expiresAt) {
      wsTokens.delete(token);
      return null;
    }
    wsTokens.delete(token); // one-time use
    return entry.userId;
  }

  // Clean expired tokens every 2 minutes
  const tokenCleanup = setInterval(() => {
    const now = Date.now();
    for (const [token, entry] of wsTokens) {
      if (now > entry.expiresAt) wsTokens.delete(token);
    }
  }, 120000).unref();

  function sendToUser(userId, data) {
    io.to(String(userId)).emit("message", data);
  }

  function sendToUsers(userIds, data) {
    for (const id of userIds) {
      io.to(String(id)).emit("message", data);
    }
  }

  function broadcast(data) {
    io.emit("message", data);
  }

  // Rooms named `arena:fight:<fighterUserId>` for read-only spectators —
  // joined/left via a `message` of type ARENA_FIGHT_SPECTATE_JOIN/LEAVE
  // (see app.js), separate from the per-user room every socket already
  // joins on connect.
  function broadcastToRoom(room, data) {
    io.to(room).emit("message", data);
  }

  function hasConnections(userId) {
    const room = io.sockets.adapter.rooms.get(String(userId));
    return room ? room.size > 0 : false;
  }

  function getConnectedUserIds() {
    return Array.from(connectedUsers);
  }

  // Auth middleware
  io.use((socket, next) => {
    const token = socket.handshake.auth?.token;
    if (!token) return next(new Error("missing token"));
    const userId = validateWsToken(token);
    if (!userId) return next(new Error("invalid token"));
    socket.userId = String(userId);
    next();
  });

  io.on("connection", (socket) => {
    const uid = socket.userId;

    socket.join(uid);
    connectedUsers.add(uid);

    socket.on("error", () => {
      // ignore transport errors
    });

    if (handleMessage) {
      socket.on("message", (msg) => {
        if (msg && typeof msg.type === "string") {
          try {
            const result = handleMessage(
              uid,
              msg,
              (data) => {
                socket.emit("message", data);
              },
              socket,
            );
            if (result && typeof result.catch === "function") {
              result.catch(() => {
                // ignore async handler errors to keep connection alive
              });
            }
          } catch {
            // ignore sync handler errors
          }
        }
      });
    }

    socket.on("disconnect", () => {
      const room = io.sockets.adapter.rooms.get(uid);
      if (!room || room.size === 0) {
        connectedUsers.delete(uid);
      }
    });
  });

  function cleanup() {
    clearInterval(tokenCleanup);
  }

  io.engine.on("close", cleanup);

  return {
    createWsToken,
    sendToUser,
    sendToUsers,
    broadcast,
    broadcastToRoom,
    hasConnections,
    getConnectedUserIds,
  };
}

/**
 * Create Socket.IO server attached to the HTTP server.
 * Must be called once during app startup.
 */
function initWebSocketServer(httpServer, deps) {
  const io = new Server(httpServer, {
    path: "/ws",
    serveClient: false,
    pingInterval: 25000,
    pingTimeout: 20000,
    cors: {
      origin: [
        "https://mirabellier.com",
        "https://www.mirabellier.com",
        // Local dev origins only when ALLOW_DEV_ORIGINS=true (see lib/dev-origins).
        ...(devOriginsEnabled() ? DEV_ORIGINS : []),
      ],
      credentials: true,
    },
  });
  instance = makeSocketIoManager(io, deps);
  return instance;
}

/**
 * Returns the WebSocket manager instance (null before init).
 */
function getWebSocketManager() {
  return instance;
}

module.exports = { initWebSocketServer, getWebSocketManager, S2C };
