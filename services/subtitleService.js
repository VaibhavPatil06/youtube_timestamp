import fs from 'fs/promises';
import path from 'path';
import logger from '../utils/logger.js';

// Convert subtitle data to SRT format
function convertToSRT(subtitleData) {
  let srt = '';
  
  subtitleData.forEach((entry, index) => {
    srt += `${index + 1}\n`;
    srt += `${formatSRTTime(entry.start)} --> ${formatSRTTime(entry.end)}\n`;
    srt += `${entry.text}\n\n`;
  });
  
  return srt;
}

// Format time for SRT (HH:MM:SS,mmm)
function formatSRTTime(timeStr) {
  // Parse time string like "0:15" or "1:30:45"
  const parts = timeStr.split(':').map(p => parseInt(p));
  
  let hours = 0, minutes = 0, seconds = 0;
  
  if (parts.length === 3) {
    [hours, minutes, seconds] = parts;
  } else if (parts.length === 2) {
    [minutes, seconds] = parts;
  } else {
    seconds = parts[0];
  }
  
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')},000`;
}

// Create and save SRT file
export async function createSRTFile(videoId, languageCode, subtitleData) {
  try {
    const srtContent = convertToSRT(subtitleData);
    
    // Ensure directory exists
    const subtitleDir = path.resolve(process.cwd(), `data/subtitles/${languageCode}`);
    await fs.mkdir(subtitleDir, { recursive: true });
    
    // Save to file
    const filePath = path.join(subtitleDir, `${videoId}.srt`);
    await fs.writeFile(filePath, srtContent, 'utf-8');
    
    logger.info(`Saved ${languageCode} subtitle for ${videoId} to ${filePath}`);
    return filePath;
  } catch (error) {
    logger.error(`Failed to create SRT file for ${videoId} (${languageCode}):`, error);
    throw error;
  }
}
