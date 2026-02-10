import express from 'express';
import cfg from './config/index.js';
import logger from './utils/logger.js';
import connectDB from './config/database.js';
import authRoutes from './routes/auth.js';
import videoRoutes from './routes/video.js';
import queueRoutes from './routes/queue.js';

const app = express();
app.use(express.json());

// Routes
app.use('/auth', authRoutes);
app.use('/api/videos', videoRoutes);
app.use('/api/queue', queueRoutes);

app.get('/', (req, res) => res.send('YouTube AI Processing System - Running'));

async function start() {
  try {
    // Connect to MongoDB
    await connectDB();
    
    // Initialize queues and workers
    logger.info('Initializing queues and workers...');
    await import('./queues/index.js');
    await import('./workers/fetchWorker.js');
    await import('./workers/processWorker.js');
    await import('./workers/uploadWorker.js');
    logger.info('Workers initialized');
    
    // Start server
    const port = cfg.port;
    app.listen(port, () => {
      logger.info(`Server listening on port ${port}`);
      logger.info('API Endpoints:');
      logger.info('  POST /api/videos/fetch - Fetch videos from YouTube');
      logger.info('  POST /api/videos/process - Process videos');
      logger.info('  GET  /api/videos/status - Get processing status');
      logger.info('  GET  /api/queue/stats - Get queue statistics');
    });
    
  } catch (error) {
    logger.error('Startup failed:', error);
    process.exit(1);
  }
}

start();
