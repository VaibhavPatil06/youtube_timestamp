import Queue from 'bull';
import logger from '../utils/logger.js';

const redisConfig = {
  host: process.env.REDIS_HOST || 'localhost',
  port: process.env.REDIS_PORT || 6379,
};

// Create queues
export const videoFetchQueue = new Queue('video-fetch', {
  redis: redisConfig,
  defaultJobOptions: {
    attempts: 3,
    backoff: {
      type: 'exponential',
      delay: 2000
    },
    removeOnComplete: 100,
    removeOnFail: false
  }
});

export const videoProcessQueue = new Queue('video-process', {
  redis: redisConfig,
  defaultJobOptions: {
    attempts: 3,
    backoff: {
      type: 'exponential',
      delay: 5000
    },
    removeOnComplete: 100,
    removeOnFail: false
  }
});

export const videoUploadQueue = new Queue('video-upload', {
  redis: redisConfig,
  defaultJobOptions: {
    attempts: 3,
    backoff: {
      type: 'exponential',
      delay: 3000
    },
    removeOnComplete: 100,
    removeOnFail: false
  }
});

// Queue event handlers
const setupQueueEvents = (queue, name) => {
  queue.on('completed', (job) => {
    logger.info(`${name} job ${job.id} completed`);
  });

  queue.on('failed', (job, err) => {
    logger.error(`${name} job ${job.id} failed:`, err.message);
  });

  queue.on('stalled', (job) => {
    logger.warn(`${name} job ${job.id} stalled`);
  });
};

setupQueueEvents(videoFetchQueue, 'video-fetch');
setupQueueEvents(videoProcessQueue, 'video-process');
setupQueueEvents(videoUploadQueue, 'video-upload');

logger.info('Bull queues initialized');
