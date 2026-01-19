// // src/routes/upload.routes.js


// import express from "express";
// import {
//   generateUploadUrl,
//   generateGetUrl,
//   deleteFile,
// } from "../controllers/upload.controller.js";

// const router = express.Router();

// router.post("/upload-url", generateUploadUrl);
// router.get("/get-file", generateGetUrl);
// router.delete("/delete-file", deleteFile);



// export default router;





import express from "express";
import {
  generateUploadUrl,
  generateGetUrl,
  deleteFile,
} from "../controllers/upload.controller.js";

const router = express.Router();

router.post("/upload-url", generateUploadUrl);
router.get("/get-file", generateGetUrl);
router.delete("/delete-file", deleteFile);

export default router;

