import Video from "../models/Video.js";
import Timestamp from "../models/Timestamp.js";
import { fetchAndSaveTranscript } from "./transcriptService.js";
import {
  generateTimestamps,
  generateSEODescription,
  // generateSubtitle,
} from "./aiService.js";
import { createSRTFile } from "./subtitleService.js";
import logger from "../utils/logger.js";
import fs from "fs/promises";
import { uploadVideo } from "./videoUploader.js";

export async function processVideo(videoId, title) {
  logger.info(`Processing video: ${videoId} - ${title}`);

  try {
    // Update status to InProgress
    await Video.updateOne({ videoId }, { status: "InProgress" });

    const video = await Video.findOne({ videoId });

    // Step 1: Fetch/Download and save transcript (New Audio Pipeline)
    let transcript;
    try {
      logger.info(`Fetching transcript for ${videoId} via audio download...`);
      transcript = await fetchAndSaveTranscript(videoId);

      if (!transcript) {
        throw new Error("Transcript generation failed");
      }
    } catch (err) {
      logger.error(`Pipeline Step 1 (Transcript) failed for ${videoId}:`, err);
      await Video.updateOne(
        { videoId },
        { status: "Failed", lastError: err.message },
      );
      return { videoId, status: "failed" }; // Return instead of throwing to continue batch
    }

    // Step 2: Generate timestamps
    try {
      logger.info(`Generating timestamps for ${videoId}`);
      const timestamps = await generateTimestamps(transcript);

      // Clear old timestamps for this video if any
      await Timestamp.deleteMany({ videoId });

      // Save timestamps to database
      for (const ts of timestamps) {
        await Timestamp.create({
          videoId,
          videoTitle: title,
          timestamp: ts.timestamp,
          description: ts.title || ts.description, // Handle both key names
        });
      }

      await Video.updateOne({ videoId }, { timestampGenerated: true });
    } catch (err) {
      logger.error(`Pipeline Step 2 (Timestamps) failed for ${videoId}:`, err);
      // We can continue even if timestamps fail, but let's log it
    }

    // Step 3: Generate SEO description
    try {
      logger.info(`Generating SEO description for ${videoId}`);
      const seoData = await generateSEODescription(
        transcript,
        video.description,
      );

      await Video.updateOne(
        { videoId },
        {
          descriptionGenerated: true,
          generatedDescription: seoData.description,
          generatedTags: seoData.hashtags || seoData.tags,
        },
      );
    } catch (err) {
      logger.error(`Pipeline Step 3 (SEO) failed for ${videoId}:`, err);
    }

    // Mark as Complete
    await Video.updateOne(
      { videoId },
      { status: "Complete", processedAt: new Date() },
    );
    logger.info(`Successfully processed video: ${videoId}`);

    return { videoId, status: "Complete" };
  } catch (error) {
    logger.error(`Critical process error for ${videoId}:`, error);

    await Video.updateOne(
      { videoId },
      {
        $inc: { retryCount: 1 },
        lastError: error.message,
        status: "Failed",
      },
    );

    return { videoId, status: "Failed" };
  }
}
