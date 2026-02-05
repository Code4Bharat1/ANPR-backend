import { WebSocketServer } from "ws";
import {
  registerAgent,
  removeAgent,
} from "./agent.socket.js";

export function initAgentWebSocket(
  server,
) {
  const wss = new WebSocketServer({
    server,
  });

  wss.on("connection", (ws) => {
    console.log("Agent connected");

    registerAgent(ws);

    ws.on("close", () => {
      console.log("Agent disconnected");
      removeAgent();
    });
  });
}
