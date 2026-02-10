import { google } from 'googleapis';
import cfg from '../config/index.js';
import fs from 'fs/promises';
import path from 'path';
import logger from '../utils/logger.js';
import APIUsage from '../models/APIUsage.js';

const oauth2Client = new google.auth.OAuth2(
  cfg.ytClientId,
  cfg.ytClientSecret,
  cfg.oauthRedirectUri
);

export function getAuthUrl() {
  const scopes = ['https://www.googleapis.com/auth/youtube.force-ssl'];
  return oauth2Client.generateAuthUrl({ access_type: 'offline', scope: scopes });
}

const TOKENS_PATH = path.resolve(process.cwd(), 'token.json');

export async function saveTokens(tokens) {
  try {
    await fs.writeFile(TOKENS_PATH, JSON.stringify(tokens, null, 2), 'utf8');
    oauth2Client.setCredentials(tokens);
    logger.info('Tokens saved and credentials set');
  } catch (err) {
    throw new Error('Failed to save tokens: ' + err.message);
  }
}

export async function loadTokens() {
  try {
    const raw = await fs.readFile(TOKENS_PATH, 'utf8');
    const tokens = JSON.parse(raw);
    oauth2Client.setCredentials(tokens);
    logger.info('Tokens loaded successfully');
    return tokens;
  } catch (err) {
    logger.error('Error loading tokens:', err.message);
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
    logger.warn('Could not auto-load tokens on startup. Please authenticate via /auth endpoint.');
  }
})();


// Track API usage
export async function trackAPIUsage(operation, cost, videoId = null) {
  try {
    const usage = await APIUsage.getTodayUsage();
    
    if (!usage.hasQuotaAvailable(cost)) {
      throw new Error(`Daily quota limit reached. Used: ${usage.unitsUsed}, Limit: ${usage.dailyLimit}`);
    }
    
    await usage.addUsage(operation, cost, videoId);
    logger.info(`API Usage tracked: ${operation} (${cost} units). Total today: ${usage.unitsUsed}/${usage.dailyLimit}`);
    
    return usage;
  } catch (error) {
    logger.error('Failed to track API usage:', error);
    throw error;
  }
}

// Fetch all videos from channel with pagination
export async function fetchAllVideosFromChannel(channelId, maxResults = null) {
  const youtube = google.youtube({ version: 'v3', auth: oauth2Client });
  const videos = [];
  let pageToken = null;
  let totalFetched = 0;
  
  try {
    do {
      // Track API usage (search.list costs 100 units)
      await trackAPIUsage('search.list', 100);
      
      const response = await youtube.search.list({
        part: ['id', 'snippet'],
        channelId,
        order: 'date',
        maxResults: 50,
        pageToken,
        type: ['video']
      });
      
      const items = response.data.items || [];
      
      for (const item of items) {
        videos.push({
          videoId: item.id.videoId,
          title: item.snippet.title,
          description: item.snippet.description,
          publishedAt: new Date(item.snippet.publishedAt),
          thumbnailUrl: item.snippet.thumbnails?.default?.url
        });
        
        totalFetched++;
        if (maxResults && totalFetched >= maxResults) break;
      }
      
      pageToken = response.data.nextPageToken;
      
      if (maxResults && totalFetched >= maxResults) break;
      
    } while (pageToken);
    
    logger.info(`Fetched ${videos.length} videos from channel ${channelId}`);
    return videos;
    
  } catch (error) {
    logger.error('Error fetching videos:', error);
    throw error;
  }
}

// Get video details
export async function getVideoDetails(videoId) {
  const youtube = google.youtube({ version: 'v3', auth: oauth2Client });
  
  try {
    await trackAPIUsage('videos.list', 1, videoId);
    
    const res = await youtube.videos.list({ 
      part: ['snippet', 'contentDetails'], 
      id: [videoId] 
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
  const youtube = google.youtube({ version: 'v3', auth: oauth2Client });
  
  try {
    const details = await getVideoDetails(videoId);
    if (!details) throw new Error('Video not found');
    
    const snippet = details.snippet;
    snippet.description = newDescription;
    
    await trackAPIUsage('videos.update', 50, videoId);
    
    const res = await youtube.videos.update({ 
      part: ['snippet'], 
      requestBody: { id: videoId, snippet } 
    });
    
    logger.info(`Updated description for video ${videoId}`);
    return res.data;
  } catch (error) {
    logger.error(`Error updating description for ${videoId}:`, error);
    throw error;
  }
}

// Upload subtitle to YouTube
export async function uploadSubtitle(videoId, languageCode, languageName, srtFilePath) {
  const youtube = google.youtube({ version: 'v3', auth: oauth2Client });
  
  try {
    const srtContent = await fs.readFile(srtFilePath, 'utf-8');
    
    await trackAPIUsage('captions.insert', 50, videoId);
    
    const res = await youtube.captions.insert({
      part: ['snippet'],
      requestBody: {
        snippet: {
          videoId,
          language: languageCode,
          name: languageName,
          isDraft: false
        }
      },
      media: {
        mimeType: 'application/x-subrip',
        body: srtContent
      }
    });
    
    logger.info(`Uploaded ${languageName} subtitle for video ${videoId}`);
    return res.data;
  } catch (error) {
    logger.error(`Error uploading subtitle for ${videoId}:`, error);
    throw error;
  }
}

export { oauth2Client };
