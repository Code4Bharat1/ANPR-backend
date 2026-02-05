// let agentSocket = null;

// export function registerAgent(ws) {
//   agentSocket = ws;
// }

// export function removeAgent() {
//   agentSocket = null;
// }

// export function sendToAgent(payload) {
//   if (!agentSocket) {
//     throw new Error("Agent is offline");
//   }

//   agentSocket.send(
//     JSON.stringify(payload),
//   );
// }
let agentSocket = null;
let pendingResolver = null;

export function registerAgent(ws) {
  agentSocket = ws;

  ws.on("message", (msg) => {
    const data = JSON.parse(
      msg.toString(),
    );

    if (pendingResolver) {
      pendingResolver(data);
      pendingResolver = null;
    }
  });
}

export function removeAgent() {
  agentSocket = null;
}

export function sendToAgentAndWait(
  payload,
  timeout = 5000,
) {
  if (!agentSocket) {
    throw new Error("Agent offline");
  }

  return new Promise(
    (resolve, reject) => {
      pendingResolver = resolve;

      agentSocket.send(
        JSON.stringify(payload),
      );

      setTimeout(() => {
        pendingResolver = null;
        reject(
          new Error("Agent timeout"),
        );
      }, timeout);
    },
  );
}
