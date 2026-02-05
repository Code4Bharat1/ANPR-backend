// import { sendToAgent } from "../agent/agent.socket.js";

// export async function loginBarrier(
//   req,
//   res,
// ) {
//   try {
//     sendToAgent({
//       type: "LOGIN_BARRIER",
//     });

//     return res.json({
//       success: true,
//       message:
//         "Login command sent to agent",
//     });
//   } catch (err) {
//     return res.status(503).json({
//       success: false,
//       message: err.message,
//     });
//   }
// }

// export async function openBarrier(
//   req,
//   res,
// ) {
//   try {
//     sendToAgent({
//       type: "OPEN_BARRIER",
//     });

//     return res.json({
//       success: true,
//       message:
//         "Barrier open command sent",
//     });
//   } catch (err) {
//     return res.status(503).json({
//       success: false,
//       message: err.message,
//     });
//   }
// }
import { sendToAgentAndWait } from "../agent/agent.socket.js";

export async function loginBarrier(
  req,
  res,
) {
  try {
    const response =
      await sendToAgentAndWait({
        type: "LOGIN_BARRIER",
      });

    if (response.type !== "LOGIN_OK") {
      throw new Error(
        response.error ||
          "Login failed",
      );
    }

    return res.json({
      success: true,
      message:
        "Barrier login successful",
    });
  } catch (err) {
    return res.status(500).json({
      success: false,
      message: err.message,
    });
  }
}

export async function openBarrier(
  req,
  res,
) {
  try {
    const response =
      await sendToAgentAndWait({
        type: "OPEN_BARRIER",
      });

    if (
      response.type !== "BARRIER_OPENED"
    ) {
      throw new Error(
        response.error ||
          "Barrier failed",
      );
    }

    return res.json({
      success: true,
      message: "Barrier opened",
    });
  } catch (err) {
    return res.status(500).json({
      success: false,
      message: err.message,
    });
  }
}
