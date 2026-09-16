import express from 'express';
import { startReviewsAuth, reviewsAuthCallback, reviewsStatus } from '../controllers/reviewsAuthController.js';

const router = express.Router();

router.get('/', startReviewsAuth);
router.get('/callback', reviewsAuthCallback);
router.get('/status', reviewsStatus);

export default router;
