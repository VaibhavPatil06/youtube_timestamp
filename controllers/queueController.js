import { videoFetchQueue, videoProcessQueue, videoUploadQueue } from '../queues/index.js';
import logger from '../utils/logger.js';

// Get queue statistics
export async function getQueueStats(req, res) {
  try {
    const fetchStats = await getQueueCounts(videoFetchQueue);
    const processStats = await getQueueCounts(videoProcessQueue);
    const uploadStats = await getQueueCounts(videoUploadQueue);
    
    res.json({
      fetch: fetchStats,
      process: processStats,
      upload: uploadStats
    });
  } catch (error) {
    logger.error('Error getting queue stats:', error);
    res.status(500).json({ error: error.message });
  }
}

// Pause all queues
export async function pauseQueues(req, res) {
  try {
    await videoFetchQueue.pause();
    await videoProcessQueue.pause();
    await videoUploadQueue.pause();
    
    logger.info('All queues paused');
    
    res.json({ message: 'All queues paused' });
  } catch (error) {
    logger.error('Error pausing queues:', error);
    res.status(500).json({ error: error.message });
  }
}

// Resume all queues
export async function resumeQueues(req, res) {
  try {
    await videoFetchQueue.resume();
    await videoProcessQueue.resume();
    await videoUploadQueue.resume();
    
    logger.info('All queues resumed');
    
    res.json({ message: 'All queues resumed' });
  } catch (error) {
    logger.error('Error resuming queues:', error);
    res.status(500).json({ error: error.message });
  }
}

// Clear failed jobs
export async function clearFailedJobs(req, res) {
  try {
    await videoFetchQueue.clean(0, 'failed');
    await videoProcessQueue.clean(0, 'failed');
    await videoUploadQueue.clean(0, 'failed');
    
    logger.info('Cleared failed jobs from all queues');
    
    res.json({ message: 'Failed jobs cleared' });
  } catch (error) {
    logger.error('Error clearing failed jobs:', error);
    res.status(500).json({ error: error.message });
  }
}

// Helper function to get queue counts
async function getQueueCounts(queue) {
  const [waiting, active, completed, failed, delayed] = await Promise.all([
    queue.getWaitingCount(),
    queue.getActiveCount(),
    queue.getCompletedCount(),
    queue.getFailedCount(),
    queue.getDelayedCount()
  ]);
  
  return { waiting, active, completed, failed, delayed };
}
