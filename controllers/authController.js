import {
  getAuthUrl,
  exchangeCodeAndSave,
  getAuthStatus,
  revokeTokens,
} from '../services/googleAuth.js';
import logger from '../utils/logger.js';

// GET /auth -> one Google consent screen for YouTube + Business Profile
export async function startAuth(req, res) {
  res.redirect(getAuthUrl());
}

// GET /auth/callback -> exchange code, verify both scopes, persist refresh token
export async function authCallback(req, res) {
  const { code, state, error } = req.query;
  if (error) return res.status(400).send(`Authorization denied: ${error}`);
  if (!code) return res.status(400).send('Missing code');
  try {
    await exchangeCodeAndSave(code, state);
    res.send(
      'Authorized for YouTube and Google Business Profile. Tokens saved — you can close this window.',
    );
  } catch (err) {
    logger.error('Auth callback error: ' + err.message);
    res.status(400).send('Auth failed: ' + err.message);
  }
}

// GET /auth/status -> checks both scopes and that the refresh token still works
export async function status(req, res) {
  res.json(await getAuthStatus());
}

// POST /auth/revoke -> revoke with Google and delete token.json
export async function revoke(req, res) {
  try {
    await revokeTokens();
    res.json({ revoked: true });
  } catch (err) {
    logger.error('Revoke error: ' + err.message);
    res.status(500).json({ revoked: false, error: err.message });
  }
}
