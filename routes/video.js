import express from 'express';
import { 
  fetchVideos, 
  processVideos, 
  getStatus, 
  getVideoStatus, 
  retryVideo 
} from '../controllers/videoController.js';

const router = express.Router();

router.post('/fetch', fetchVideos);
router.post('/process', processVideos);
router.get('/status', getStatus);
router.get('/:id', getVideoStatus);
router.post('/:id/retry', retryVideo);

export default router;
