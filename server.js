import express from "express";
import cfg from "./config/index.js";
import logger from "./utils/logger.js";
import connectDB from "./config/database.js";
import authRoutes from "./routes/auth.js";
import reviewsAuthRoutes from "./routes/reviewsAuth.js";
import videoRoutes from "./routes/video.js";

const app = express();
app.use(express.json());

// Routes
app.use("/auth", authRoutes);
app.use("/auth/reviews", reviewsAuthRoutes);
app.use("/api/videos", videoRoutes);

app.get("/", (req, res) => res.send("YouTube AI Processing System - Running"));

async function start() {
  try {
    // Connect to MongoDB
    await connectDB();

    // Initialize system (no queues or workers needed)
    logger.info("Initializing system...");
    await import("./queues/index.js");
    logger.info("System initialized");

    // Start server
    const port = cfg.port;
    app.listen(port, () => {
      logger.info(`Server listening on port ${port}`);
      logger.info("API Endpoints:");
      logger.info("  POST /api/videos/fetch - Fetch videos from YouTube");
      logger.info("  POST /api/videos/process - Process videos");
      logger.info("  GET  /api/videos/status - Get processing status");
      logger.info("  GET  /auth/reviews - Start Google Business Profile (reviews) OAuth flow");
      logger.info("  GET  /auth/reviews/status - Check reviews auth status");
    });
  } catch (error) {
    logger.error("Startup failed:", error);
    process.exit(1);
  }
}

start();
