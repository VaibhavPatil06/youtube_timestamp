# YouTube AI Processing System

A production-ready, scalable backend system for processing 4000+ YouTube videos with AI-powered enhancements including timestamps, SEO descriptions, and multi-language subtitles.

## Features

- ✅ Batch processing with configurable limits
- ✅ Queue-based architecture with Bull & Redis
- ✅ MongoDB storage for videos, timestamps, and API usage tracking
- ✅ AI-powered timestamp generation
- ✅ SEO description and hashtag generation
- ✅ Multi-language subtitle generation (English, Hindi, Spanish)
- ✅ YouTube API quota tracking (9000 units/day limit)
- ✅ Automatic retry mechanism for failed videos
- ✅ Comprehensive logging with Winston

## Prerequisites

1. **Node.js** >= 18
2. **MongoDB** - Running locally or remote connection
3. **Redis** - Required for Bull queue system
   - Windows: Download from [https://github.com/microsoftarchive/redis/releases](https://github.com/microsoftarchive/redis/releases)
   - Or use Docker: `docker run -d -p 6379:6379 redis`
4. **YouTube API Credentials** - OAuth2 client ID and secret
5. **Gemini API Key** - For AI processing

## Installation

```bash
# Install dependencies
npm install

# Copy environment template
cp .env.example .env

# Edit .env with your credentials
# Required: MONGODB_URI, YT_CLIENT_ID, YT_CLIENT_SECRET, GEMINI_API_KEY, CHANNEL_ID
```

## Configuration

Edit `.env` file:

```env
# MongoDB
MONGODB_URI=mongodb://localhost:27017/youtube-optimizer

# YouTube API
YT_CLIENT_ID=your-client-id.apps.googleusercontent.com
YT_CLIENT_SECRET=your-client-secret
CHANNEL_ID=your-channel-id

# Gemini AI
GEMINI_API_KEY=your-gemini-api-key

# Redis (default: localhost:6379)
REDIS_HOST=localhost
REDIS_PORT=6379

# Processing
BATCH_SIZE=5
MAX_RETRIES=3
DAILY_QUOTA_LIMIT=9000
```

## Usage

### 1. Start the server

```bash
npm start
```

### 2. Authenticate with YouTube

Visit `http://localhost:3000/auth` in your browser to authorize the application.

### 3. Fetch videos from your channel

```bash
curl -X POST http://localhost:3000/api/videos/fetch \
  -H "Content-Type: application/json" \
  -d '{"channelId": "YOUR_CHANNEL_ID", "maxResults": 100}'
```

### 4. Process videos (batch of 5)

```bash
curl -X POST http://localhost:3000/api/videos/process?limit=5
```

### 5. Check processing status

```bash
curl http://localhost:3000/api/videos/status
```

### 6. Monitor queue statistics

```bash
curl http://localhost:3000/api/queue/stats
```

## API Endpoints

### Videos

- `POST /api/videos/fetch` - Fetch videos from YouTube channel
- `POST /api/videos/process?limit=N` - Process N videos
- `GET /api/videos/status` - Get overall processing status
- `GET /api/videos/:videoId` - Get specific video status
- `POST /api/videos/:videoId/retry` - Retry failed video

### Queue Management

- `GET /api/queue/stats` - Get queue statistics
- `POST /api/queue/pause` - Pause all queues
- `POST /api/queue/resume` - Resume all queues
- `POST /api/queue/clear-failed` - Clear failed jobs

## Architecture

```
├── models/          # MongoDB schemas (Video, Timestamp, APIUsage)
├── services/        # Business logic (YouTube, AI, Transcript, Subtitle)
├── queues/          # Bull queue initialization
├── workers/         # Queue processors (Fetch, Process, Upload)
├── controllers/     # API endpoint handlers
├── routes/          # Express routes
├── config/          # Configuration and database connection
└── data/            # Generated files
    ├── transcripts/ # Video transcripts
    └── subtitles/   # SRT files (en, hi, es)
```

## Processing Pipeline

1. **Fetch Worker**: Retrieves all videos from YouTube channel, stores in MongoDB
2. **Process Worker**: For each video:
   - Fetches and saves transcript
   - Generates timestamps with Gemini AI
   - Generates SEO description and tags
   - Creates subtitles in 3 languages (EN, HI, ES)
3. **Upload Worker**:
   - Uploads subtitle files to YouTube
   - Updates video description with timestamps and tags

## Quota Management

The system automatically tracks YouTube API usage and enforces the daily limit:

- Default limit: 9000 units/day
- Stops processing when limit is reached
- Tracks usage per operation in MongoDB
- View current usage: `GET /api/videos/status`

## Retry Mechanism

Failed videos are automatically retried up to 3 times (configurable via `MAX_RETRIES`). Manual retry:

```bash
curl -X POST http://localhost:3000/api/videos/VIDEO_ID/retry
```

## Monitoring

Check logs in console (Winston logger) for:
- Queue job progress
- API usage tracking
- Error details
- Processing status

## Troubleshooting

### Redis connection error
Ensure Redis is running: `redis-cli ping` should return `PONG`

### MongoDB connection error
Check `MONGODB_URI` in `.env` and ensure MongoDB is running

### YouTube API quota exceeded
Wait until next day (UTC) or increase quota in Google Cloud Console

### Worker not processing
Check queue stats: `GET /api/queue/stats`
Resume if paused: `POST /api/queue/resume`

## License

MIT
