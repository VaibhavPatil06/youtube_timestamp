import express from "express";
import {
  fetchVideos,
  processVideos,
  getStatus,
  getVideoStatus,
  retryVideo,
  getChannels,
} from "../controllers/videoController.js";

const router = express.Router();

router.get("/channels", getChannels);
router.post("/fetch", fetchVideos);
router.post("/process", processVideos);
router.get("/status", getStatus);
router.get("/:id", getVideoStatus);
router.post("/:id/retry", retryVideo);

export default router;
