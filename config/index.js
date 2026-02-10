import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });

const cfg = {
  port: process.env.PORT || 3000,
  mongoUri: process.env.MONGODB_URI,
  ytClientId: process.env.YT_CLIENT_ID,
  ytClientSecret: process.env.YT_CLIENT_SECRET,
  oauthRedirectUri: process.env.OAUTH_REDIRECT_URI,
  channelId: process.env.CHANNEL_ID,
  geminiApiKey: process.env.GEMINI_API_KEY,
  geminiModel: process.env.GEMINI_MODEL || 'gemini-1.5-pro',
  gcpProject: process.env.GCP_PROJECT,
  redisHost: process.env.REDIS_HOST || 'localhost',
  redisPort: process.env.REDIS_PORT || 6379,
  batchSize: parseInt(process.env.BATCH_SIZE) || 5,
  maxRetries: parseInt(process.env.MAX_RETRIES) || 3,
  dailyQuotaLimit: parseInt(process.env.DAILY_QUOTA_LIMIT) || 9000
};

export default cfg;
