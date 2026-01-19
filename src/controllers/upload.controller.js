// // src/controllers/upload.controller.js


// import {
//   getUploadUrl,
//   getDownloadUrl,
//   deleteFileFromWasabi,
// } from "../utils/wasabiUpload.js";

// /**
//  * Generate signed upload URL
//  */
// export const generateUploadUrl = async (req, res, next) => {
//   try {
//     const { vehicleId, type, index, fileName, fileType } = req.body;

//     if (!vehicleId || !type || !index || !fileName || !fileType) {
//       return res.status(400).json({ message: "Missing required fields" });
//     }

//     if (!["entry", "exit"].includes(type)) {
//       return res.status(400).json({ message: "Type must be entry or exit" });
//     }

//     if (index < 1 || index > 4) {
//       return res.status(400).json({ message: "Only 4 photos allowed" });
//     }

//     const data = await getUploadUrl({
//       vehicleId,
//       type,
//       index,
//       fileName,
//       fileType,
//     });

//     res.status(200).json(data);
//   } catch (err) {
//     next(err);
//   }
// };

// /**
//  * Generate signed download URL
//  */
// export const generateGetUrl = async (req, res, next) => {
//   try {
//     const { key } = req.query;

//     if (!key) {
//       return res.status(400).json({ message: "Key required" });
//     }

//     const url = await getDownloadUrl(key);
//     res.status(200).json({ url });
//   } catch (err) {
//     next(err);
//   }
// };

// /**
//  * Delete file from Wasabi
//  */
// export const deleteFile = async (req, res, next) => {
//   try {
//     const { key } = req.query;

//     if (!key) {
//       return res.status(400).json({ message: "Key required" });
//     }

//     await deleteFileFromWasabi(key);

//     res.status(200).json({ message: "File deleted successfully" });
//   } catch (err) {
//     next(err);
//   }
// };









import {
  getUploadUrl,
  getDownloadUrl,
  deleteFileFromWasabi,
} from "../utils/wasabiUpload.js";

/**
 * Generate signed upload URL
 */
export const generateUploadUrl = async (req, res, next) => {
  try {
    const { vehicleId, type, index, fileName, fileType } = req.body;

    if (!vehicleId || !type || !fileName || !fileType) {
      return res.status(400).json({ message: "Missing required fields" });
    }

    if (!["entry", "exit"].includes(type)) {
      return res.status(400).json({ message: "Type must be entry or exit" });
    }

    // Photo validation (1–4)
    if (!fileType.startsWith("video")) {
      if (!index || index < 1 || index > 4) {
        return res.status(400).json({
          message: "Photo index must be between 1 and 4",
        });
      }
    }

    const data = await getUploadUrl({
      vehicleId,
      type,
      index,
      fileName,
      fileType,
    });

    res.status(200).json(data);
  } catch (err) {
    next(err);
  }
};

/**
 * Generate signed download URL
 */
export const generateGetUrl = async (req, res, next) => {
  try {
    const { key } = req.query;

    if (!key) {
      return res.status(400).json({ message: "Key required" });
    }

    const url = await getDownloadUrl(key);
    res.status(200).json({ url });
  } catch (err) {
    next(err);
  }
};

/**
 * Delete file from Wasabi
 */
export const deleteFile = async (req, res, next) => {
  try {
    const { key } = req.query;

    if (!key) {
      return res.status(400).json({ message: "Key required" });
    }

    await deleteFileFromWasabi(key);

    res.status(200).json({ message: "File deleted successfully" });
  } catch (err) {
    next(err);
  }
};

