import express from 'express';
import { startAuth, authCallback, status } from '../controllers/authController.js';

const router = express.Router();

router.get('/', startAuth);
router.get('/callback', authCallback);
router.get('/status', status);

export default router;
