import { google } from "googleapis";
import cfg from "../config/index.js";
import fs from "fs/promises";
import path from "path";
import logger from "../utils/logger.js";
import APIUsage from "../models/APIUsage.js";

const oauth2Client = new google.auth.OAuth2(
  cfg.ytClientId,
  cfg.ytClientSecret,
  cfg.oauthRedirectUri,
);

export function getAuthUrl() {
  const scopes = ["https://www.googleapis.com/auth/youtube.force-ssl"];
  return oauth2Client.generateAuthUrl({
    access_type: "offline",
    scope: scopes,
  });
}

const TOKENS_PATH = path.resolve(process.cwd(), "token.json");

export async function saveTokens(tokens) {
  try {
    await fs.writeFile(TOKENS_PATH, JSON.stringify(tokens, null, 2), "utf8");
    oauth2Client.setCredentials(tokens);
    logger.info("Tokens saved and credentials set");
  } catch (err) {
    throw new Error("Failed to save tokens: " + err.message);
  }
}

export async function loadTokens() {
  try {
    const raw = await fs.readFile(TOKENS_PATH, "utf8");
    const tokens = JSON.parse(raw);
    oauth2Client.setCredentials(tokens);
    logger.info("Tokens loaded successfully");
    console.log(
      "✅ OAuth tokens loaded. Access token:",
      tokens.access_token?.substring(0, 20) + "...",
    );
    return tokens;
  } catch (err) {
    logger.error("Error loading tokens:", err.message);
    console.log(
      "❌ No valid tokens found. Please authenticate via /auth endpoint",
    );
    return null;
  }
}

export async function exchangeCodeAndSave(code) {
  const { tokens } = await oauth2Client.getToken(code);
  await saveTokens(tokens);
  return tokens;
}

// Auto-load tokens on module initialization
(async () => {
  try {
    await loadTokens();
  } catch (error) {
    logger.warn(
      "Could not auto-load tokens on startup. Please authenticate via /auth endpoint.",
    );
  }
})();

// Track API usage
export async function trackAPIUsage(operation, cost, videoId = null) {
  try {
    const usage = await APIUsage.getTodayUsage();

    if (!usage.hasQuotaAvailable(cost)) {
      throw new Error(
        `Daily quota limit reached. Used: ${usage.unitsUsed}, Limit: ${usage.dailyLimit}`,
      );
    }

    await usage.addUsage(operation, cost, videoId);
    logger.info(
      `API Usage tracked: ${operation} (${cost} units). Total today: ${usage.unitsUsed}/${usage.dailyLimit}`,
    );

    return usage;
  } catch (error) {
    logger.error("Failed to track API usage:", error);
    throw error;
  }
}

// Fetch all videos from channel with pagination
export async function fetchAllVideosFromChannel(channelId, maxResults = null) {
  const youtube = google.youtube({ version: "v3", auth: oauth2Client });
  const videos = [];
  let pageToken = null;
  let totalFetched = 0;
  let pageCount = 0;

  try {
    // First, get the uploads playlist ID for this channel
    console.log(`📺 Fetching uploads playlist for channel: ${channelId}`);

    const channelResponse = await youtube.channels.list({
      part: ["contentDetails"],
      id: [channelId],
    });

    if (
      !channelResponse.data.items ||
      channelResponse.data.items.length === 0
    ) {
      throw new Error(`Channel ${channelId} not found`);
    }

    const uploadsPlaylistId =
      channelResponse.data.items[0].contentDetails.relatedPlaylists.uploads;
    console.log(`✅ Found uploads playlist: ${uploadsPlaylistId}`);

    // Now fetch videos from the uploads playlist
    do {
      pageCount++;
      console.log(
        `📄 Fetching page ${pageCount} from playlist ${uploadsPlaylistId}...`,
      );
      logger.info(`Fetching page ${pageCount} for channel ${channelId}...`);

      // Track API usage (playlistItems.list costs 1 unit)
      try {
        await trackAPIUsage("playlistItems.list", 1);
      } catch (err) {
        logger.error(
          `API usage tracking failed on page ${pageCount}:`,
          err.message,
        );
        throw err;
      }

      const startTime = Date.now();
      const response = await youtube.playlistItems.list({
        part: ["snippet"],
        playlistId: uploadsPlaylistId,
        maxResults: 50,
        pageToken,
      });
      const duration = Date.now() - startTime;

      // Detailed API response logging
      console.log(
        "🔍 RAW API Response:",
        JSON.stringify(
          {
            status: response.status,
            itemsLength: response.data.items?.length || 0,
            hasNextPage: !!response.data.nextPageToken,
            firstItem: response.data.items?.[0]
              ? {
                  videoId: response.data.items[0].snippet?.resourceId?.videoId,
                  title: response.data.items[0].snippet?.title,
                }
              : null,
          },
          null,
          2,
        ),
      );

      const items = response.data.items || [];
      logger.info(
        `Page ${pageCount} returned ${items.length} items (${duration}ms)`,
      );
      console.log(`✅ Page ${pageCount}: ${items.length} videos found`);

      for (const item of items) {
        videos.push({
          videoId: item.snippet.resourceId.videoId,
          title: item.snippet.title,
          description: item.snippet.description,
          publishedAt: new Date(item.snippet.publishedAt),
          thumbnailUrl: item.snippet.thumbnails?.default?.url,
        });

        totalFetched++;
        if (maxResults && totalFetched >= maxResults) break;
      }

      pageToken = response.data.nextPageToken;

      if (maxResults && totalFetched >= maxResults) break;
    } while (pageToken);

    console.log(`✅ Successfully fetched ${videos.length} total videos`);
    logger.info(`Fetched ${videos.length} videos from channel ${channelId}`);
    return videos;
  } catch (error) {
    console.error("❌ Error fetching videos:", error.message);
    logger.error("Error fetching videos:", error);
    throw error;
  }
}

// Get video details
export async function getVideoDetails(videoId) {
  const youtube = google.youtube({ version: "v3", auth: oauth2Client });

  try {
    await trackAPIUsage("videos.list", 1, videoId);

    const res = await youtube.videos.list({
      part: ["snippet", "contentDetails"],
      id: [videoId],
    });

    if (!res.data.items || !res.data.items.length) return null;
    return res.data.items[0];
  } catch (error) {
    logger.error(`Error getting video details for ${videoId}:`, error);
    throw error;
  }
}

// Update video description
export async function updateVideoDescription(videoId, newDescription) {
  const youtube = google.youtube({ version: "v3", auth: oauth2Client });

  try {
    const details = await getVideoDetails(videoId);
    if (!details) throw new Error("Video not found");

    const snippet = details.snippet;
    snippet.description = newDescription;

    await trackAPIUsage("videos.update", 50, videoId);

    const res = await youtube.videos.update({
      part: ["snippet"],
      requestBody: { id: videoId, snippet },
    });

    logger.info(`Updated description for video ${videoId}`);
    return res.data;
  } catch (error) {
    logger.error(`Error updating description for ${videoId}:`, error);
    throw error;
  }
}

// Upload subtitle to YouTube
export async function uploadSubtitle(
  videoId,
  languageCode,
  languageName,
  srtFilePath,
) {
  const youtube = google.youtube({ version: "v3", auth: oauth2Client });

  try {
    const srtContent = await fs.readFile(srtFilePath, "utf-8");

    await trackAPIUsage("captions.insert", 50, videoId);

    const res = await youtube.captions.insert({
      part: ["snippet"],
      requestBody: {
        snippet: {
          videoId,
          language: languageCode,
          name: languageName,
          isDraft: false,
        },
      },
      media: {
        mimeType: "application/x-subrip",
        body: srtContent,
      },
    });

    logger.info(`Uploaded ${languageName} subtitle for video ${videoId}`);
    return res.data;
  } catch (error) {
    logger.error(`Error uploading subtitle for ${videoId}:`, error);
    throw error;
  }
}

// Get authenticated user's channels
export async function getMyChannels() {
  const youtube = google.youtube({ version: "v3", auth: oauth2Client });

  try {
    const response = await youtube.channels.list({
      part: ["id", "snippet"],
      mine: true,
    });

    const channels = response.data.items || [];
    logger.info(`Found ${channels.length} channels for authenticated user`);

    channels.forEach((channel, idx) => {
      console.log(
        `  [${idx + 1}] ${channel.snippet.title} (ID: ${channel.id})`,
      );
    });

    return channels;
  } catch (error) {
    logger.error("Error fetching user channels:", error.message);
    console.error(
      "❌ Make sure you authenticated. Visit: http://localhost:3000/auth",
    );
    throw error;
  }
}

export { oauth2Client };
