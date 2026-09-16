import {
  getReviewsAuthUrl,
  exchangeReviewsCodeAndSave,
  loadReviewsTokens,
} from "../services/googleReviewsService.js";
import logger from "../utils/logger.js";

export async function startReviewsAuth(req, res) {
  const url = getReviewsAuthUrl();
  res.redirect(url);
}

export async function reviewsAuthCallback(req, res) {
  const code = req.query.code;
  if (!code) return res.status(400).send("Missing code");
  try {
    await exchangeReviewsCodeAndSave(code);
    res.send("Reviews tokens saved. You can close this window.");
  } catch (err) {
    logger.error("Reviews auth callback error: " + err.message);
    res.status(500).send("Auth failed");
  }
}

export async function reviewsStatus(req, res) {
  const tokens = await loadReviewsTokens();
  res.json({ authorized: !!tokens });
}
