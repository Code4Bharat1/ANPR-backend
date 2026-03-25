import { WebSocketServer } from "ws";
import { registerAgent } from "./agent.socket.js";

export function initAgentWebSocket(server) {
  const wss = new WebSocketServer({ server });

  wss.on("connection", (ws) => {
    console.log("🔌 New agent connection — waiting for REGISTER message");
    // registerAgent sets up message + close handlers internally
    registerAgent(ws);
  });
}
