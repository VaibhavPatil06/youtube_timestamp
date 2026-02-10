import { YoutubeTranscript } from 'youtube-transcript';
import logger from '../utils/logger.js';
import fs from 'fs/promises';
import path from 'path';

export async function getTranscript(videoId) {
  try {
    const lines = await YoutubeTranscript.fetchTranscript(videoId);
    // lines: [{text, duration, start}]
    return lines.map((l) => `${formatTime(l.start)} ${l.text}`).join('\n');
  } catch (err) {
    logger.error(`Transcript fetch failed for ${videoId}: ${err.message}`);
    throw err;
  }
}

export async function fetchAndSaveTranscript(videoId) {
  try {
    const transcript = await getTranscript(videoId);
    
    // Ensure directory exists
    const transcriptDir = path.resolve(process.cwd(), 'data/transcripts');
    await fs.mkdir(transcriptDir, { recursive: true });
    
    // Save to file
    const filePath = path.join(transcriptDir, `${videoId}.txt`);
    await fs.writeFile(filePath, transcript, 'utf-8');
    
    logger.info(`Saved transcript for ${videoId} to ${filePath}`);
    return transcript;
  } catch (error) {
    logger.error(`Failed to fetch and save transcript for ${videoId}:`, error);
    throw error;
  }
}

function formatTime(seconds) {
  seconds = Math.max(0, Math.floor(seconds));
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  return `${m}:${String(s).padStart(2, '0')}`;
}
