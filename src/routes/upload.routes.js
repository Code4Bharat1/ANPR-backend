import express from "express";
import {
  generateUploadUrl,
  generateGetUrl,
} from "../controllers/upload.controller.js";

const router = express.Router();

router.post("/upload-url", generateUploadUrl);
router.get("/get-file", generateGetUrl);


export default router;
