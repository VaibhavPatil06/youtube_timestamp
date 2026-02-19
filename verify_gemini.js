import { transcribeAudioWithGemini } from './services/aiService.js';
import path from 'path';
import cfg from './config/index.js';

async function testTranscription() {
  const testAudioPath = path.resolve(process.cwd(), 'data/audio/dQw4w9WgXcQ.mp3');
  try {
    console.log('Testing Gemini transcription...');
    const transcript = await transcribeAudioWithGemini(testAudioPath);
    console.log('Transcription result (first 500 chars):');
    console.log(transcript.substring(0, 500));
  } catch (err) {
    console.error('Transcription failed:', err);
  }
}

testTranscription();
