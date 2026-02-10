import { getAuthUrl, exchangeCodeAndSave, loadTokens } from '../services/youtubeService.js';
import logger from '../utils/logger.js';

export async function startAuth(req, res) {
  const url = getAuthUrl();
  res.redirect(url);
}

export async function authCallback(req, res) {
  const code = req.query.code;
  if (!code) return res.status(400).send('Missing code');
  try {
    await exchangeCodeAndSave(code);
    res.send('Tokens saved. You can close this window.');
  } catch (err) {
    logger.error('Auth callback error: ' + err.message);
    res.status(500).send('Auth failed');
  }
}

export async function status(req, res) {
  const tokens = await loadTokens();
  res.json({ authorized: !!tokens });
}
