// plate.routes.js
import express from "express";
import { readPlate, getAllPlates } from "../controllers/plate.controller.js";

const router = express.Router();

// Scan plate
router.post("/read", readPlate);

// Get history
router.get("/history", getAllPlates);

export default router;  