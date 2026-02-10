import { videoUploadQueue } from '../queues/index.js';
import Video from '../models/Video.js';
import Timestamp from '../models/Timestamp.js';
import { uploadSubtitle, updateVideoDescription, trackAPIUsage } from '../services/youtubeService.js';
import logger from '../utils/logger.js';
import path from 'path';

videoUploadQueue.process(async (job) => {
  const { videoId, title } = job.data;
  
  logger.info(`Uploading results for video: ${videoId} - ${title}`);
  
  try {
    const video = await Video.findOne({ videoId });
    
    if (!video) {
      throw new Error(`Video ${videoId} not found in database`);
    }
    
    // Step 1: Upload subtitles
    const languages = [
      { code: 'en', name: 'English' },
      { code: 'hi', name: 'Hindi' },
      { code: 'es', name: 'Spanish' }
    ];
    
    for (const lang of languages) {
      const srtPath = path.resolve(process.cwd(), `data/subtitles/${lang.code}/${videoId}.srt`);
      
      try {
        await uploadSubtitle(videoId, lang.code, lang.name, srtPath);
        logger.info(`Uploaded ${lang.name} subtitle for ${videoId}`);
        job.progress(30);
      } catch (error) {
        logger.error(`Failed to upload ${lang.name} subtitle for ${videoId}:`, error.message);
        // Continue with other languages
      }
    }
    
    // Step 2: Build description with timestamps
    const timestamps = await Timestamp.find({ videoId }).sort({ timestamp: 1 });
    
    let timestampText = '\n\n📌 Chapters:\n';
    for (const ts of timestamps) {
      timestampText += `${ts.timestamp} - ${ts.description}\n`;
    }
    
    const tags = video.generatedTags || [];
    const hashtagText = tags.length > 0 ? '\n\n' + tags.join(' ') : '';
    
    const finalDescription = `${video.generatedDescription || video.description}${timestampText}${hashtagText}\n\n<!-- AI_OPTIMIZED -->`;
    
    // Step 3: Update video description
    await updateVideoDescription(videoId, finalDescription);
    logger.info(`Updated description for ${videoId}`);
    
    job.progress(70);
    
    // Step 4: Mark as complete
    await Video.updateOne(
      { videoId },
      {
        status: 'Complete',
        uploadedAt: new Date(),
        autoDubEnabled: true
      }
    );
    
    job.progress(100);
    
    logger.info(`Successfully uploaded results for video: ${videoId}`);
    
    return { videoId, status: 'uploaded' };
    
  } catch (error) {
    logger.error(`Upload worker error for ${videoId}:`, error);
    
    // Update error status
    await Video.updateOne(
      { videoId },
      {
        $inc: { retryCount: 1 },
        lastError: error.message,
        status: 'Failed'
      }
    );
    
    throw error;
  }
});

logger.info('Upload worker initialized');
