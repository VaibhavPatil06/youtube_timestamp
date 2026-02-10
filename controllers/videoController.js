import { fetchAllVideosFromChannel } from "../services/youtubeService.js";
import Video from "../models/Video.js";
import APIUsage from "../models/APIUsage.js";
import logger from "../utils/logger.js";
import { processVideo } from "../services/videoProcessor.js";
import { uploadVideo } from "../services/videoUploader.js";

// Trigger video fetch from YouTube
export async function fetchVideos(req, res) {
  try {
    const { channelId, maxResults } = req.body;
    if (!channelId) {
      return res.status(400).json({ error: "channelId is required" });
    }

    res.json({
      message: "Video fetch started (running in background)",
      status: "fetching",
    });

    // Run fetch in background without blocking response
    (async () => {
      try {
        logger.info(`Starting video fetch for channel: ${channelId}`);
        const startTime = Date.now();
        const videos = await fetchAllVideosFromChannel(channelId, maxResults);
        const duration = Date.now() - startTime;

        logger.info(
          `Fetched ${videos.length} videos from YouTube in ${duration}ms`,
        );

        let newCount = 0;
        let existingCount = 0;

        // Store videos in database
        for (const video of videos) {
          const existing = await Video.findOne({ videoId: video.videoId });

          if (!existing) {
            await Video.create({
              videoId: video.videoId,
              title: video.title,
              description: video.description,
              publishedAt: video.publishedAt,
              thumbnailUrl: video.thumbnailUrl,
              duration: video.duration,
              status: "New",
            });
            newCount++;
          } else {
            existingCount++;
          }
        }

        logger.info(
          `Stored ${newCount} new videos, ${existingCount} already existed`,
        );

        // Auto-process new videos
        const batchSize = parseInt(process.env.BATCH_SIZE) || 5;
        const newVideos = await Video.find({ status: "New" }).limit(batchSize);

        for (const video of newVideos) {
          try {
            await processVideo(video.videoId, video.title);
          } catch (err) {
            logger.error(
              `Error processing video ${video.videoId}:`,
              err.message,
            );
          }
        }

        logger.info(`Processed ${newVideos.length} videos`);
      } catch (error) {
        logger.error("Fetch error:", error);
      }
    })();
  } catch (error) {
    logger.error("Error fetching videos:", error);
    res.status(500).json({ error: error.message });
  }
}

// Start processing videos
export async function processVideos(req, res) {
  try {
    const limit =
      parseInt(req.query.limit) || parseInt(process.env.BATCH_SIZE) || 5;

    // Get unprocessed videos
    const videos = await Video.find({
      status: { $in: ["New", "Failed"] },
      retryCount: { $lt: parseInt(process.env.MAX_RETRIES) || 3 },
    })
      .sort({ createdAt: 1 })
      .limit(limit);

    if (videos.length === 0) {
      return res.json({ message: "No videos to process" });
    }

    // Check quota availability
    const usage = await APIUsage.getTodayUsage();
    const estimatedCost = videos.length * 200; // Rough estimate

    if (!usage.hasQuotaAvailable(estimatedCost)) {
      return res.status(429).json({
        error: "Daily quota limit reached",
        used: usage.unitsUsed,
        limit: usage.dailyLimit,
      });
    }

    res.json({
      message: `Processing ${videos.length} videos in background`,
      count: videos.length,
      videos: videos.map((v) => ({ id: v.videoId, title: v.title })),
    });

    // Process videos in background
    (async () => {
      for (const video of videos) {
        try {
          await processVideo(video.videoId, video.title);
        } catch (error) {
          logger.error(
            `Error processing video ${video.videoId}:`,
            error.message,
          );
          await Video.updateOne(
            { videoId: video.videoId },
            {
              $inc: { retryCount: 1 },
              lastError: error.message,
              status: "Failed",
            },
          );
        }
      }
      logger.info(`Finished processing ${videos.length} videos`);
    })();
  } catch (error) {
    logger.error("Error processing videos:", error);
    res.status(500).json({ error: error.message });
  }
}

// Get processing status
export async function getStatus(req, res) {
  try {
    const stats = await Video.aggregate([
      {
        $group: {
          _id: "$status",
          count: { $sum: 1 },
        },
      },
    ]);

    const usage = await APIUsage.getTodayUsage();

    const statusMap = {};
    stats.forEach((s) => {
      statusMap[s._id] = s.count;
    });

    res.json({
      videos: {
        new: statusMap.New || 0,
        inProgress: statusMap.InProgress || 0,
        complete: statusMap.Complete || 0,
        failed: statusMap.Failed || 0,
        total: Object.values(statusMap).reduce((a, b) => a + b, 0),
      },
      apiUsage: {
        used: usage.unitsUsed,
        limit: usage.dailyLimit,
        remaining: usage.dailyLimit - usage.unitsUsed,
        percentage: ((usage.unitsUsed / usage.dailyLimit) * 100).toFixed(2),
      },
    });
  } catch (error) {
    logger.error("Error getting status:", error);
    res.status(500).json({ error: error.message });
  }
}

// Get individual video status
export async function getVideoStatus(req, res) {
  try {
    const { id } = req.params;

    const video = await Video.findOne({ videoId: id });

    if (!video) {
      return res.status(404).json({ error: "Video not found" });
    }

    res.json(video);
  } catch (error) {
    logger.error("Error getting video status:", error);
    res.status(500).json({ error: error.message });
  }
}

// Retry failed video
export async function retryVideo(req, res) {
  try {
    const { id } = req.params;

    const video = await Video.findOne({ videoId: id });

    if (!video) {
      return res.status(404).json({ error: "Video not found" });
    }

    if (video.status !== "Failed") {
      return res.status(400).json({ error: "Video is not in failed state" });
    }

    // Reset status and enqueue
    await Video.updateOne({ videoId: id }, { status: "New", lastError: null });

    // Process video
    res.json({
      message: "Video queued for retry",
      videoId: id,
    });

    (async () => {
      try {
        await processVideo(video.videoId, video.title);
      } catch (err) {
        logger.error(`Error retrying video ${id}:`, err.message);
      }
    })();
  } catch (error) {
    logger.error("Error retrying video:", error);
    res.status(500).json({ error: error.message });
  }
}

// Get authenticated user's YouTube channels
export async function getChannels(req, res) {
  try {
    const { getMyChannels } = await import("../services/youtubeService.js");
    const channels = await getMyChannels();

    res.json({
      message: "Your YouTube channels",
      count: channels.length,
      channels: channels.map((c) => ({
        id: c.id,
        title: c.snippet.title,
        description: c.snippet.description,
      })),
    });
  } catch (error) {
    logger.error("Error fetching channels:", error);
    res.status(500).json({
      error: "Failed to fetch channels. Make sure you authenticated via /auth",
      details: error.message,
    });
  }
}
