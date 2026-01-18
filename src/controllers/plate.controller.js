// plate.controller.js
import axios from "axios";
import Plate from "../models/Plate.model.js";

export const readPlate = async (req, res) => {
  try {
    const { image_base64 } = req.body;

    if (!image_base64) {
      return res.status(400).json({
        success: false,
        error: "Image required",
      });
    }

    // ✅ Ensure FULL data URL
    const imageData = image_base64.startsWith("data:image")
      ? image_base64
      : `data:image/jpeg;base64,${image_base64}`;

    console.log("🚀 Calling Plate Recognizer API...");

    let apiResponse;

    // 🔁 Retry logic (Render + network safe)
    for (let attempt = 1; attempt <= 2; attempt++) {
      try {
        console.log(`🔁 OCR API attempt ${attempt}`);

        apiResponse = await axios.post(
          "https://api.platerecognizer.com/v1/plate-reader/",
          {
            upload: imageData,
            regions: ["in", "gb"],
            mmc: true,
            direction: true,
          },
          {
            headers: {
              Authorization: `Token ${process.env.PLATE_RECOGNIZER_API_KEY}`,
              "Content-Type": "application/json",
            },
            timeout: 30000, // ⬅️ Render safe
          }
        );

        break; // success → exit retry loop
      } catch (err) {
        const isTimeout = err.code === "ECONNABORTED";
        console.warn(
          `⚠️ OCR attempt ${attempt} failed`,
          isTimeout ? "Timeout" : err.message
        );

        if (attempt === 2) throw err;
      }
    }

    console.log(
      "✅ API raw response:",
      JSON.stringify(apiResponse.data, null, 2)
    );

    const result = apiResponse.data?.results?.[0];

    if (!result) {
      return res.status(200).json({
        success: false,
        message: "No plate detected",
        rawResponse: apiResponse.data,
      });
    }

    // ✅ Prepare DB object
    const plateData = {
      plate: result.plate,
      score: result.score,
      vehicle: result.vehicle || {},
      direction: result.direction,
      region: result.region?.code,
      box: result.box,
    };

    console.log("💾 Saving to database:", plateData);

    const savedPlate = await Plate.create(plateData);

    console.log("✅ Saved successfully:", savedPlate._id);

    return res.status(200).json({
      success: true,
      plate: savedPlate.plate,
      score: savedPlate.score,
      vehicle: savedPlate.vehicle,
      direction: savedPlate.direction,
      region: savedPlate.region,
      _id: savedPlate._id,
    });
  } catch (error) {
    console.error("❌ Error in readPlate:", error);

    return res.status(500).json({
      success: false,
      error:
        error.response?.data?.error ||
        error.message ||
        "Plate OCR failed",
    });
  }
};
