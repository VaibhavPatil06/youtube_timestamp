import Video from "../models/Video.js";
import Timestamp from "../models/Timestamp.js";
import { fetchAndSaveTranscript } from "./transcriptService.js";
import {
  generateTimestamps,
  generateSEODescription,
  generateSubtitle,
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

    // Step 1: Fetch and save transcript
    if (!video.transcriptGenerated) {
      logger.info(`Fetching transcript for ${videoId}`);
      const transcript = await fetchAndSaveTranscript(videoId);

      await Video.updateOne({ videoId }, { transcriptGenerated: true });
    }

    // Read transcript for AI processing
    const transcriptPath = `data/transcripts/${videoId}.txt`;
    const transcript = await fs.readFile(transcriptPath, "utf-8");

    // Step 2: Generate timestamps
    if (!video.timestampGenerated) {
      logger.info(`Generating timestamps for ${videoId}`);
      const timestamps = await generateTimestamps(transcript);

      // Save timestamps to database
      for (const ts of timestamps) {
        await Timestamp.create({
          videoId,
          videoTitle: title,
          timestamp: ts.timestamp,
          description: ts.description,
        });
      }

      await Video.updateOne({ videoId }, { timestampGenerated: true });
    }

    // Step 3: Generate SEO description
    if (!video.descriptionGenerated) {
      logger.info(`Generating SEO description for ${videoId}`);
      const seoData = await generateSEODescription(
        transcript,
        video.description,
      );

      // Store in video document for later upload
      await Video.updateOne(
        { videoId },
        {
          descriptionGenerated: true,
          generatedDescription: seoData.description,
          generatedTags: seoData.tags,
        },
      );
    }

    // Step 4: Generate subtitles
    if (!video.subtitleGenerated) {
      logger.info(`Generating subtitles for ${videoId}`);

      const languages = ["en", "hi", "es"];

      for (const lang of languages) {
        const subtitleData = await generateSubtitle(transcript, lang);
        await createSRTFile(videoId, lang, subtitleData);
      }

      await Video.updateOne({ videoId }, { subtitleGenerated: true });
    }

    // Auto-upload after processing
    logger.info(`Auto-uploading video ${videoId}`);
    await uploadVideo(videoId, title);

    logger.info(`Successfully processed video: ${videoId}`);

    return { videoId, status: "processed" };
  } catch (error) {
    logger.error(`Process error for ${videoId}:`, error);

    // Update error status
    await Video.updateOne(
      { videoId },
      {
        $inc: { retryCount: 1 },
        lastError: error.message,
        status: "Failed",
      },
    );

    throw error;
  }
}
