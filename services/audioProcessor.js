import path from "path";
import fs from "fs/promises";
import fsSync from "fs";
import ytdl from "ytdl-core";
import ffmpeg from "fluent-ffmpeg";
import ffmpegPath from "ffmpeg-static";
import logger from "../utils/logger.js";
import cfg from "../config/index.js";
import { trackAPIUsage } from "./youtubeService.js";
import {
  transcribeAudioWithGemini as aiTranscribe,
  generateTimestampsFromTranscript as aiGenerateTimestamps,
  generateDescriptionFromTranscript as aiGenerateDescription,
} from "./aiService.js";
import Video from "../models/Video.js";
import { SpeechClient } from "@google-cloud/speech";

ffmpeg.setFfmpegPath(ffmpegPath || "ffmpeg");

const speechClient = new SpeechClient();

async function ensureDir(dir) {
  await fs.mkdir(dir, { recursive: true });
}

async function downloadAudio(videoId) {
  const audioDir = path.resolve(process.cwd(), "data/audio");
  await ensureDir(audioDir);
  const outPath = path.join(audioDir, `${videoId}.mp3`);

  // If file already exists, skip download
  if (fsSync.existsSync(outPath)) {
    logger.info(`Audio already exists for ${videoId}, skipping download`);
    return outPath;
  }

  const url = `https://www.youtube.com/watch?v=${videoId}`;
  logger.info(`Downloading audio for ${videoId}`);

  return new Promise((resolve, reject) => {
    const audioStream = ytdl(url, {
      filter: "audioonly",
      quality: "highestaudio",
    });

    ffmpeg(audioStream)
      .audioBitrate(128)
      .format("mp3")
      .on("error", (err) => {
        logger.error(`ffmpeg error for ${videoId}: ${err.message}`);
        reject(err);
      })
      .on("end", () => {
        logger.info(`Saved audio for ${videoId} to ${outPath}`);
        resolve(outPath);
      })
      .save(outPath);
  });
}

// Primary transcription function. Tries Gemini multimodal if configured, otherwise falls back to Google Speech-to-Text.
export async function transcribeAudioWithGemini(audioPath, videoId = null) {
  try {
    // Track API usage for transcription (logical unit)
    try {
      await trackAPIUsage("audio.transcribe", 50, videoId);
    } catch (usageErr) {
      logger.warn(
        `API usage tracking failed for audio.transcribe: ${usageErr.message}`,
      );
    }

    // Try VertexAI/Gemini transcription first via aiService
    try {
      logger.info(
        "Attempting Gemini transcription via aiService.transcribeAudioWithGemini",
      );
      const geminiText = await aiTranscribe(audioPath);
      if (geminiText) return geminiText;
      logger.warn(
        "aiService returned empty transcript, falling back to Speech-to-Text",
      );
    } catch (err) {
      logger.warn(
        `aiService transcription failed: ${err.message}. Falling back to Speech-to-Text`,
      );
    }

    // Fallback: use Google Cloud Speech-to-Text
    logger.info("Using Google Speech-to-Text for transcription fallback");
    const audioBytes = await fs
      .readFile(audioPath)
      .then((b) => b.toString("base64"));

    const request = {
      audio: { content: audioBytes },
      config: {
        encoding: "MP3",
        languageCode: cfg.languageCode || "en-US",
        enableAutomaticPunctuation: true,
        model: "default",
      },
    };

    // Use longRunningRecognize for potentially long audio
    const [operation] = await speechClient.longRunningRecognize(request);
    const [response] = await operation.promise();
    const transcript = response.results
      .map(
        (r) =>
          r.alternatives && r.alternatives[0] && r.alternatives[0].transcript,
      )
      .filter(Boolean)
      .join(" ");

    return transcript || null;
  } catch (error) {
    logger.error(`transcribeAudioWithGemini failed: ${error.message}`);
    throw error;
  }
}

export async function generateTimestampsFromTranscript(
  transcript,
  videoId = null,
) {
  try {
    // Track generative usage
    try {
      await trackAPIUsage("generative.timestamps", 1, videoId);
    } catch (usageErr) {
      logger.warn(
        `API usage tracking failed for generative.timestamps: ${usageErr.message}`,
      );
    }

    const prompt = `You are given a clean transcript. Create a minimum of 8 chapter timestamps for a YouTube video. The first timestamp must be 0:00. Return ONLY a JSON array of objects in this exact format:\n[{"timestamp":"0:00","title":"Introduction"}, {"timestamp":"2:15","title":"Main topic"}]\nMake timestamps human-friendly and evenly distributed across the content.`;

    const raw = await aiGenerateTimestamps(transcript);
    const arr = raw;
    logger.info(
      `Generated ${arr.length} timestamps for ${videoId || "unknown"}`,
    );
    return arr;
  } catch (error) {
    logger.error(`generateTimestampsFromTranscript failed: ${error.message}`);
    throw error;
  }
}

export async function generateDescriptionFromTranscript(
  transcript,
  oldDescription = "",
  videoId = null,
) {
  try {
    try {
      await trackAPIUsage("generative.description", 1, videoId);
    } catch (usageErr) {
      logger.warn(
        `API usage tracking failed for generative.description: ${usageErr.message}`,
      );
    }

    const prompt = `Using the transcript produce an engaging YouTube description. Requirements:\n- First two lines: engaging hook\n- Then bullet highlights\n- Then a call to action\n- Provide 15 relevant hashtags as an array.\nReturn ONLY a JSON object in this exact format:\n{\n  "description": "...",\n  "hashtags": ["#tag1", "#tag2", ...]\n}\nKeep the description suitable for YouTube and SEO-minded.`;

    const parsed = await aiGenerateDescription(transcript, oldDescription);
    logger.info(
      `Generated description and ${parsed.hashtags?.length || 0} hashtags for ${videoId || "unknown"}`,
    );
    return parsed;
  } catch (error) {
    logger.error(`generateDescriptionFromTranscript failed: ${error.message}`);
    throw error;
  }
}

// Full per-video pipeline
export async function processVideoAudio(videoId, oldDescription = "") {
  try {
    // Update status InProgress
    await Video.findOneAndUpdate({ videoId }, { status: "InProgress" }).catch(
      (e) => logger.warn(e.message),
    );

    const audioPath = await downloadAudio(videoId);
    const transcript = await transcribeAudioWithGemini(audioPath, videoId);

    if (!transcript) {
      // mark failed but continue batch
      await Video.findOneAndUpdate(
        { videoId },
        { transcriptGenerated: false, status: "Failed" },
      ).catch((e) => logger.warn(e.message));
      logger.warn(`Transcription empty for ${videoId}`);
      return { success: false };
    }

    // Save transcript
    const transcriptDir = path.resolve(process.cwd(), "data/transcripts");
    await ensureDir(transcriptDir);
    const transcriptPath = path.join(transcriptDir, `${videoId}.txt`);
    await fs.writeFile(transcriptPath, transcript, "utf8");

    // Generate timestamps
    let timestamps = null;
    try {
      timestamps = await generateTimestampsFromTranscript(transcript, videoId);
    } catch (err) {
      logger.warn(`Timestamp generation failed for ${videoId}: ${err.message}`);
    }

    // Generate description
    let descriptionData = null;
    try {
      descriptionData = await generateDescriptionFromTranscript(
        transcript,
        oldDescription,
        videoId,
      );
    } catch (err) {
      logger.warn(
        `Description generation failed for ${videoId}: ${err.message}`,
      );
    }

    // Update DB fields
    const update = {
      transcriptGenerated: !!transcript,
      timestampGenerated: !!timestamps,
      descriptionGenerated: !!descriptionData,
      status: "Complete",
      processedAt: new Date(),
    };

    if (descriptionData) {
      update.generatedDescription = descriptionData.description;
      update.generatedTags =
        descriptionData.hashtags || descriptionData.tags || [];
    }

    await Video.findOneAndUpdate({ videoId }, update).catch((e) =>
      logger.warn(e.message),
    );

    // Optionally save timestamps JSON to disk
    if (timestamps) {
      const tPath = path.join(transcriptDir, `${videoId}.timestamps.json`);
      await fs
        .writeFile(tPath, JSON.stringify(timestamps, null, 2), "utf8")
        .catch((e) => logger.warn(e.message));
    }

    return { success: true, transcriptPath, timestamps, descriptionData };
  } catch (error) {
    logger.error(`processVideoAudio failed for ${videoId}: ${error.message}`);
    await Video.findOneAndUpdate(
      { videoId },
      { status: "Failed", transcriptGenerated: false },
    ).catch((e) => logger.warn(e.message));
    return { success: false, error: error.message };
  }
}

export default {
  downloadAudio,
  transcribeAudioWithGemini,
  generateTimestampsFromTranscript,
  generateDescriptionFromTranscript,
  processVideoAudio,
};
