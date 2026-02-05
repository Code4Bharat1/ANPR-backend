
import express from "express";
import {
  loginBarrier,
  openBarrier,
} from "../controllers/barrier.controller.js";

const router = express.Router();

router.post("/login", loginBarrier);
router.post("/open", openBarrier);

export default router;
