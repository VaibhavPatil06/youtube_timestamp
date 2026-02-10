import { videoProcessQueue, videoUploadQueue } from '../queues/index.js';
import Video from '../models/Video.js';
import Timestamp from '../models/Timestamp.js';
import { fetchAndSaveTranscript } from '../services/transcriptService.js';
import { generateTimestamps, generateSEODescription, generateSubtitle } from '../services/aiService.js';
import { createSRTFile } from '../services/subtitleService.js';
import logger from '../utils/logger.js';
import fs from 'fs/promises';

videoProcessQueue.process(async (job) => {
  const { videoId, title } = job.data;
  
  logger.info(`Processing video: ${videoId} - ${title}`);
  
  try {
    // Update status to InProgress
    await Video.updateOne(
      { videoId },
      { status: 'InProgress' }
    );
    
    const video = await Video.findOne({ videoId });
    
    // Step 1: Fetch and save transcript
    if (!video.transcriptGenerated) {
      logger.info(`Fetching transcript for ${videoId}`);
      const transcript = await fetchAndSaveTranscript(videoId);
      
      await Video.updateOne(
        { videoId },
        { transcriptGenerated: true }
      );
      
      job.progress(20);
    }
    
    // Read transcript for AI processing
    const transcriptPath = `data/transcripts/${videoId}.txt`;
    const transcript = await fs.readFile(transcriptPath, 'utf-8');
    
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
          description: ts.description
        });
      }
      
      await Video.updateOne(
        { videoId },
        { timestampGenerated: true }
      );
      
      job.progress(40);
    }
    
    // Step 3: Generate SEO description
    if (!video.descriptionGenerated) {
      logger.info(`Generating SEO description for ${videoId}`);
      const seoData = await generateSEODescription(transcript, video.description);
      
      // Store in video document for later upload
      await Video.updateOne(
        { videoId },
        { 
          descriptionGenerated: true,
          generatedDescription: seoData.description,
          generatedTags: seoData.tags
        }
      );
      
      job.progress(60);
    }
    
    // Step 4: Generate subtitles
    if (!video.subtitleGenerated) {
      logger.info(`Generating subtitles for ${videoId}`);
      
      const languages = ['en', 'hi', 'es'];
      
      for (const lang of languages) {
        const subtitleData = await generateSubtitle(transcript, lang);
        await createSRTFile(videoId, lang, subtitleData);
      }
      
      await Video.updateOne(
        { videoId },
        { subtitleGenerated: true }
      );
      
      job.progress(80);
    }
    
    // Mark processing complete
    await Video.updateOne(
      { videoId },
      { processedAt: new Date() }
    );
    
    // Enqueue upload job
    await videoUploadQueue.add({
      videoId,
      title
    });
    
    job.progress(100);
    
    logger.info(`Successfully processed video: ${videoId}`);
    
    return { videoId, status: 'processed' };
    
  } catch (error) {
    logger.error(`Process worker error for ${videoId}:`, error);
    
    // Update retry count and error
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

logger.info('Process worker initialized');
