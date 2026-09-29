import express from 'express';
import { startAuth, authCallback, status, revoke } from '../controllers/authController.js';

const router = express.Router();

router.get('/', startAuth);
router.get('/callback', authCallback);
router.get('/status', status);
router.post('/revoke', revoke);

// Legacy reviews-only endpoints now go through the combined flow
router.get('/reviews', (req, res) => res.redirect('/auth'));
router.get('/reviews/status', status);

export default router;
