import { downloadAudio } from './services/transcriptService.js';
import logger from './utils/logger.js';
import mongoose from 'mongoose';
import cfg from './config/index.js';

async function testDownload() {
  const testVideoId = 'dQw4w9WgXcQ'; // Rick Astley - Never Gonna Give You Up
  try {
    // We don't need mongo for just downloadAudio if we don't call high level services, 
    // but transcriptService.js imports Video model, so we might need a connection or mock.
    // Let's just mock Video if needed or connect to a local db.
    await mongoose.connect(cfg.mongoUri);
    
    console.log('Testing audio download...');
    const path = await downloadAudio(testVideoId);
    console.log('Download successful:', path);
  } catch (err) {
    console.error('Download failed:', err);
  } finally {
    await mongoose.disconnect();
  }
}

testDownload();
