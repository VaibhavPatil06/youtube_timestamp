import { videoFetchQueue } from '../queues/index.js';
import { fetchAllVideosFromChannel } from '../services/youtubeService.js';
import Video from '../models/Video.js';
import logger from '../utils/logger.js';
import { videoProcessQueue } from '../queues/index.js';

videoFetchQueue.process(async (job) => {
  const { channelId, maxResults } = job.data;
  
  logger.info(`Starting video fetch for channel: ${channelId}`);
  
  try {
    // Fetch all videos from YouTube
    const videos = await fetchAllVideosFromChannel(channelId, maxResults);
    
    logger.info(`Fetched ${videos.length} videos from YouTube`);
    
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
          status: 'New'
        });
        newCount++;
      } else {
        existingCount++;
      }
    }
    
    logger.info(`Stored ${newCount} new videos, ${existingCount} already existed`);
    
    // Enqueue processing jobs for new videos
    const batchSize = parseInt(process.env.BATCH_SIZE) || 5;
    const newVideos = await Video.find({ status: 'New' }).limit(batchSize);
    
    for (const video of newVideos) {
      await videoProcessQueue.add({
        videoId: video.videoId,
        title: video.title
      }, {
        priority: 1
      });
    }
    
    logger.info(`Enqueued ${newVideos.length} videos for processing`);
    
    return {
      totalFetched: videos.length,
      newVideos: newCount,
      existingVideos: existingCount,
      enqueued: newVideos.length
    };
    
  } catch (error) {
    logger.error('Fetch worker error:', error);
    throw error;
  }
});

logger.info('Fetch worker initialized');
