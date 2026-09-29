import { google } from "googleapis";
import crypto from "crypto";
import fs from "fs/promises";
import path from "path";
import cfg from "../config/index.js";
import logger from "../utils/logger.js";

// Single OAuth client shared by YouTube + Google Business Profile.
// One consent screen grants both scopes and yields ONE long-lived refresh token.
export const SCOPES = {
  youtube: "https://www.googleapis.com/auth/youtube.force-ssl",
  business: "https://www.googleapis.com/auth/business.manage",
};

const TOKENS_PATH = path.resolve(process.cwd(), "token.json");
const STATE_TTL_MS = 10 * 60 * 1000;

export const oauth2Client = new google.auth.OAuth2(
  cfg.ytClientId,
  cfg.ytClientSecret,
  cfg.oauthRedirectUri,
);

// Google only returns refresh_token on the first consent (or with prompt=consent),
// and refreshed credentials never include it — so always merge with what's on disk.
let currentTokens = null;

async function writeTokens(tokens) {
  await fs.writeFile(TOKENS_PATH, JSON.stringify(tokens, null, 2), "utf8");
}

// googleapis auto-refreshes the access token using the refresh token whenever it
// expires; persist every refresh so restarts pick up the latest access token.
oauth2Client.on("tokens", async (fresh) => {
  try {
    currentTokens = { ...currentTokens, ...fresh };
    if (!currentTokens.refresh_token) return;
    await writeTokens(currentTokens);
    logger.info("Access token refreshed and persisted");
  } catch (err) {
    logger.error("Failed to persist refreshed tokens: " + err.message);
  }
});

// ---- CSRF state for the consent round-trip ----
const pendingStates = new Map();

function createState() {
  const state = crypto.randomBytes(24).toString("hex");
  pendingStates.set(state, Date.now() + STATE_TTL_MS);
  return state;
}

function consumeState(state) {
  const now = Date.now();
  for (const [s, exp] of pendingStates) if (exp < now) pendingStates.delete(s);
  if (!state || !pendingStates.has(state)) return false;
  pendingStates.delete(state);
  return true;
}

export function getAuthUrl() {
  return oauth2Client.generateAuthUrl({
    access_type: "offline", // required to receive a refresh_token
    prompt: "consent", // force Google to re-issue a refresh_token every time
    include_granted_scopes: true,
    scope: Object.values(SCOPES),
    state: createState(),
  });
}

function grantedScopes(tokens) {
  return (tokens?.scope || "").split(/\s+/).filter(Boolean);
}

export async function exchangeCodeAndSave(code, state) {
  if (!consumeState(state)) {
    throw new Error("Invalid or expired OAuth state. Start again at /auth");
  }

  const { tokens } = await oauth2Client.getToken(code);

  // Users can untick scopes on Google's consent screen — fail loudly if they did.
  const granted = grantedScopes(tokens);
  const missing = Object.entries(SCOPES)
    .filter(([, scope]) => !granted.includes(scope))
    .map(([name]) => name);
  if (missing.length) {
    throw new Error(
      `Missing permissions: ${missing.join(", ")}. Re-run /auth and allow all requested access.`,
    );
  }

  const merged = {
    ...tokens,
    refresh_token: tokens.refresh_token || currentTokens?.refresh_token,
  };
  if (!merged.refresh_token) {
    throw new Error(
      "Google did not return a refresh token. Revoke app access at https://myaccount.google.com/permissions and retry /auth",
    );
  }

  await writeTokens(merged);
  currentTokens = merged;
  oauth2Client.setCredentials(merged);
  logger.info("OAuth tokens saved (YouTube + Business Profile)");
  return merged;
}

export async function loadTokens() {
  try {
    const tokens = JSON.parse(await fs.readFile(TOKENS_PATH, "utf8"));
    currentTokens = tokens;
    oauth2Client.setCredentials(tokens);
    logger.info("OAuth tokens loaded");
    return tokens;
  } catch (err) {
    if (err.code !== "ENOENT") {
      logger.error("Error loading tokens: " + err.message);
    }
    logger.warn("No OAuth tokens found. Authenticate via /auth");
    return null;
  }
}

// Verifies the refresh token still works by forcing an access-token fetch.
export async function getAuthStatus() {
  const tokens = currentTokens || (await loadTokens());
  const granted = grantedScopes(tokens);
  const scopes = Object.fromEntries(
    Object.entries(SCOPES).map(([name, scope]) => [name, granted.includes(scope)]),
  );

  if (!tokens?.refresh_token) {
    return { authorized: false, hasRefreshToken: false, scopes };
  }

  try {
    await oauth2Client.getAccessToken();
    return {
      authorized: Object.values(scopes).every(Boolean),
      hasRefreshToken: true,
      scopes,
      accessTokenExpiresAt: currentTokens?.expiry_date
        ? new Date(currentTokens.expiry_date).toISOString()
        : null,
    };
  } catch (err) {
    // invalid_grant => refresh token revoked/expired; user must re-consent.
    logger.error("Refresh token check failed: " + err.message);
    return {
      authorized: false,
      hasRefreshToken: true,
      scopes,
      error: err.response?.data?.error || err.message,
    };
  }
}

export async function revokeTokens() {
  const token = currentTokens?.refresh_token || currentTokens?.access_token;
  if (token) {
    try {
      await oauth2Client.revokeToken(token);
    } catch (err) {
      logger.warn("Token revoke call failed: " + err.message);
    }
  }
  currentTokens = null;
  oauth2Client.setCredentials({});
  await fs.rm(TOKENS_PATH, { force: true });
  logger.info("OAuth tokens revoked and removed");
}

await loadTokens();
