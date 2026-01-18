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

    // ✅ Ensure FULL data URL (Plate Recognizer requirement)
    const imageData = image_base64.startsWith("data:image")
      ? image_base64
      : `data:image/jpeg;base64,${image_base64}`;

    console.log("🚀 Calling Plate Recognizer API...");

    const response = await axios.post(
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
        timeout: 15000,
      }
    );

    console.log(
      "✅ API raw response:",
      JSON.stringify(response.data, null, 2)
    );

    const result = response.data?.results?.[0];

    if (!result) {
      return res.status(200).json({
        success: false,
        message: "No plate detected",
        rawResponse: response.data,
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

    // ✅ Frontend-friendly response
    res.status(200).json({
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

    res.status(500).json({
      success: false,
      error:
        error.response?.data?.error ||
        error.message ||
        "Plate OCR failed",
      details:
        process.env.NODE_ENV === "development"
          ? error.stack
          : undefined,
    });
  }
};

// ================= HISTORY API =================

export const getAllPlates = async (req, res) => {
  try {
    const plates = await Plate.find()
      .sort({ createdAt: -1 })
      .limit(50);

    res.status(200).json({
      success: true,
      count: plates.length,
      data: plates,
    });
  } catch (error) {
    console.error("❌ Error fetching plates:", error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
};
