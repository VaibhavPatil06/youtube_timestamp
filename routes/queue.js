import express from 'express';
import { 
  getQueueStats, 
  pauseQueues, 
  resumeQueues, 
  clearFailedJobs 
} from '../controllers/queueController.js';

const router = express.Router();

router.get('/stats', getQueueStats);
router.post('/pause', pauseQueues);
router.post('/resume', resumeQueues);
router.post('/clear-failed', clearFailedJobs);

export default router;
