import { google } from "googleapis";
import cfg from "../config/index.js";
import fs from "fs/promises";
import path from "path";
import logger from "../utils/logger.js";

const reviewsOauth2Client = new google.auth.OAuth2(
  cfg.ytClientId,
  cfg.ytClientSecret,
  cfg.reviewsOauthRedirectUri,
);

export function getReviewsAuthUrl() {
  const scopes = ["https://www.googleapis.com/auth/business.manage"];
  return reviewsOauth2Client.generateAuthUrl({
    access_type: "offline",
    prompt: "consent",
    scope: scopes,
  });
}

const REVIEWS_TOKENS_PATH = path.resolve(process.cwd(), "reviews_token.json");

export async function saveReviewsTokens(tokens) {
  try {
    await fs.writeFile(REVIEWS_TOKENS_PATH, JSON.stringify(tokens, null, 2), "utf8");
    reviewsOauth2Client.setCredentials(tokens);
    logger.info("Reviews tokens saved and credentials set");
  } catch (err) {
    throw new Error("Failed to save reviews tokens: " + err.message);
  }
}

export async function loadReviewsTokens() {
  try {
    const raw = await fs.readFile(REVIEWS_TOKENS_PATH, "utf8");
    const tokens = JSON.parse(raw);
    reviewsOauth2Client.setCredentials(tokens);
    logger.info("Reviews tokens loaded successfully");
    return tokens;
  } catch (err) {
    logger.error("Error loading reviews tokens:", err.message);
    return null;
  }
}

export async function exchangeReviewsCodeAndSave(code) {
  const { tokens } = await reviewsOauth2Client.getToken(code);
  await saveReviewsTokens(tokens);
  return tokens;
}

// Auto-load tokens on module initialization
(async () => {
  try {
    await loadReviewsTokens();
  } catch (error) {
    logger.warn(
      "Could not auto-load reviews tokens on startup. Please authenticate via /auth/reviews endpoint.",
    );
  }
})();

export { reviewsOauth2Client };
