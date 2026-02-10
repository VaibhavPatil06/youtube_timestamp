import express from 'express';
import { processLatest } from '../controllers/youtubeController.js';

const router = express.Router();

router.post('/process-latest', processLatest);

export default router;
