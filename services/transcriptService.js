import path from "path";
import fs from "fs/promises";
import logger from "../utils/logger.js";
import audioProcessor from "./audioProcessor.js";
import Video from "../models/Video.js";

export async function getTranscript(videoId) {
  const filePath = path.resolve(
    process.cwd(),
    "data/transcripts",
    `${videoId}.txt`,
  );
  try {
    const content = await fs.readFile(filePath, "utf8");
    return content;
  } catch (err) {
    logger.warn(`Transcript file not found for ${videoId}: ${err.message}`);
    throw err;
  }
}

export async function fetchAndSaveTranscript(videoId, currentDescription = "") {
  try {
    // Delegate to audio processor pipeline which handles download, transcription, generation and DB updates.
    const result = await audioProcessor.processVideoAudio(
      videoId,
      currentDescription,
    );
    if (!result || !result.success) {
      logger.warn(
        `Audio processing pipeline returned no transcript for ${videoId}`,
      );
      return null;
    }

    // If pipeline returned transcriptPath, read and return contents
    if (result.transcriptPath) {
      try {
        const content = await fs.readFile(result.transcriptPath, "utf8");
        return content;
      } catch (err) {
        logger.warn(
          `Failed to read saved transcript for ${videoId}: ${err.message}`,
        );
        return null;
      }
    }

    return null;
  } catch (error) {
    logger.error(
      `fetchAndSaveTranscript failed for ${videoId}: ${error.message}`,
    );
    await Video.findOneAndUpdate(
      { videoId },
      { status: "Failed", lastError: error.message },
    ).catch(() => {});
    return null;
  }
}
