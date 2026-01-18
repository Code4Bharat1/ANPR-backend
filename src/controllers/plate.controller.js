// plate.controller.js
import fetch from "node-fetch";
import Plate from "../models/Plate.model.js";

export const readPlate = async (req, res) => {
  try {
    const { image_base64 } = req.body;

    if (!image_base64) {
      return res.status(400).json({ error: "Image required" });
    }

    // Plate Recognizer API ko full data URL chahiye
    const imageData = image_base64.startsWith('data:image')
      ? image_base64
      : `data:image/jpeg;base64,${image_base64}`;

    console.log("Calling Plate Recognizer API...");

    const response = await fetch(
      "https://api.platerecognizer.com/v1/plate-reader/",
      {
        method: "POST",
        headers: {
          Authorization: `Token ${process.env.PLATE_RECOGNIZER_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          upload: imageData,
          regions: ["in", "gb"], // India region add kiya
        }),
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      console.error("API Error:", errorText);
      return res.status(response.status).json({ 
        error: "Plate Recognizer API failed",
        details: errorText 
      });
    }

    const data = await response.json();
    console.log("API Response:", JSON.stringify(data, null, 2));

    const result = data.results?.[0];

    if (!result) {
      return res.status(200).json({ 
        message: "No plate detected",
        rawResponse: data 
      });
    }

    // Database mein save karo
    const plateData = {
      plate: result.plate,
      score: result.score,
      vehicle: result.vehicle || {},
      direction: result.direction,
      region: result.region?.code,
      box: result.box,
    };

    console.log("Saving to database:", plateData);

    const savedPlate = await Plate.create(plateData);
    console.log("Saved successfully:", savedPlate._id);

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
    console.error("Error in readPlate:", error);
    res.status(500).json({ 
      error: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
};

// Get all plates history
export const getAllPlates = async (req, res) => {
  try {
    const plates = await Plate.find()
      .sort({ createdAt: -1 })
      .limit(50);
    
    res.status(200).json({
      success: true,
      count: plates.length,
      data: plates
    });
  } catch (error) {
    console.error("Error fetching plates:", error);
    res.status(500).json({ error: error.message });
  }
};