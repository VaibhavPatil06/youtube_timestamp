import { videoFetchQueue, videoProcessQueue } from '../queues/index.js';
import Video from '../models/Video.js';
import APIUsage from '../models/APIUsage.js';
import logger from '../utils/logger.js';

// Trigger video fetch from YouTube
export async function fetchVideos(req, res) {
  try {
    const { channelId, maxResults } = req.body;
    
    if (!channelId) {
      return res.status(400).json({ error: 'channelId is required' });
    }
    
    const job = await videoFetchQueue.add({
      channelId,
      maxResults: maxResults || null
    });
    
    logger.info(`Fetch job created: ${job.id}`);
    
    res.json({
      message: 'Video fetch job queued',
      jobId: job.id
    });
  } catch (error) {
    logger.error('Error queueing fetch job:', error);
    res.status(500).json({ error: error.message });
  }
}

// Start processing videos
export async function processVideos(req, res) {
  try {
    const limit = parseInt(req.query.limit) || parseInt(process.env.BATCH_SIZE) || 5;
    
    // Get unprocessed videos
    const videos = await Video.find({ 
      status: { $in: ['New', 'Failed'] },
      retryCount: { $lt: parseInt(process.env.MAX_RETRIES) || 3 }
    })
    .sort({ createdAt: 1 })
    .limit(limit);
    
    if (videos.length === 0) {
      return res.json({ message: 'No videos to process' });
    }
    
    // Check quota availability
    const usage = await APIUsage.getTodayUsage();
    const estimatedCost = videos.length * 200; // Rough estimate
    
    if (!usage.hasQuotaAvailable(estimatedCost)) {
      return res.status(429).json({
        error: 'Daily quota limit reached',
        used: usage.unitsUsed,
        limit: usage.dailyLimit
      });
    }
    
    // Enqueue processing jobs
    const jobs = [];
    for (const video of videos) {
      const job = await videoProcessQueue.add({
        videoId: video.videoId,
        title: video.title
      });
      jobs.push(job.id);
    }
    
    logger.info(`Queued ${jobs.length} videos for processing`);
    
    res.json({
      message: `Queued ${jobs.length} videos for processing`,
      jobIds: jobs,
      videos: videos.map(v => ({ id: v.videoId, title: v.title }))
    });
  } catch (error) {
    logger.error('Error processing videos:', error);
    res.status(500).json({ error: error.message });
  }
}

// Get processing status
export async function getStatus(req, res) {
  try {
    const stats = await Video.aggregate([
      {
        $group: {
          _id: '$status',
          count: { $sum: 1 }
        }
      }
    ]);
    
    const usage = await APIUsage.getTodayUsage();
    
    const statusMap = {};
    stats.forEach(s => {
      statusMap[s._id] = s.count;
    });
    
    res.json({
      videos: {
        new: statusMap.New || 0,
        inProgress: statusMap.InProgress || 0,
        complete: statusMap.Complete || 0,
        failed: statusMap.Failed || 0,
        total: Object.values(statusMap).reduce((a, b) => a + b, 0)
      },
      apiUsage: {
        used: usage.unitsUsed,
        limit: usage.dailyLimit,
        remaining: usage.dailyLimit - usage.unitsUsed,
        percentage: ((usage.unitsUsed / usage.dailyLimit) * 100).toFixed(2)
      }
    });
  } catch (error) {
    logger.error('Error getting status:', error);
    res.status(500).json({ error: error.message });
  }
}

// Get individual video status
export async function getVideoStatus(req, res) {
  try {
    const { id } = req.params;
    
    const video = await Video.findOne({ videoId: id });
    
    if (!video) {
      return res.status(404).json({ error: 'Video not found' });
    }
    
    res.json(video);
  } catch (error) {
    logger.error('Error getting video status:', error);
    res.status(500).json({ error: error.message });
  }
}

// Retry failed video
export async function retryVideo(req, res) {
  try {
    const { id } = req.params;
    
    const video = await Video.findOne({ videoId: id });
    
    if (!video) {
      return res.status(404).json({ error: 'Video not found' });
    }
    
    if (video.status !== 'Failed') {
      return res.status(400).json({ error: 'Video is not in failed state' });
    }
    
    // Reset status and enqueue
    await Video.updateOne(
      { videoId: id },
      { status: 'New', lastError: null }
    );
    
    const job = await videoProcessQueue.add({
      videoId: video.videoId,
      title: video.title
    });
    
    logger.info(`Retry job created for ${id}: ${job.id}`);
    
    res.json({
      message: 'Video queued for retry',
      jobId: job.id
    });
  } catch (error) {
    logger.error('Error retrying video:', error);
    res.status(500).json({ error: error.message });
  }
}
