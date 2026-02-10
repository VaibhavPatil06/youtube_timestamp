import { GoogleGenerativeAI } from '@google/generative-ai';
import cfg from '../config/index.js';
import logger from '../utils/logger.js';

const genAI = new GoogleGenerativeAI(cfg.geminiApiKey);

// Generate timestamps from transcript
export async function generateTimestamps(transcript) {
  try {
    const model = genAI.getGenerativeModel({ model: cfg.geminiModel });
    
    const prompt = `Analyze this video transcript and generate chapter timestamps with descriptions.
Return ONLY a JSON array in this exact format:
[{"timestamp": "0:00", "description": "Introduction"}, {"timestamp": "2:15", "description": "Main topic"}]

Transcript:
${transcript}`;

    const result = await model.generateContent(prompt);
    const response = result.response.text();
    
    // Extract JSON from response
    const jsonMatch = response.match(/\[[\s\S]*\]/);
    if (!jsonMatch) {
      throw new Error('Failed to extract JSON from AI response');
    }
    
    const timestamps = JSON.parse(jsonMatch[0]);
    logger.info(`Generated ${timestamps.length} timestamps`);
    
    return timestamps;
  } catch (error) {
    logger.error('Error generating timestamps:', error);
    throw error;
  }
}

// Generate SEO description and tags
export async function generateSEODescription(transcript, currentDescription = '') {
  try {
    const model = genAI.getGenerativeModel({ model: cfg.geminiModel });
    
    const prompt = `Create an SEO-optimized YouTube description and hashtags based on this transcript.
Current description: ${currentDescription}

Return ONLY a JSON object in this exact format:
{"description": "SEO optimized description here", "tags": ["#tag1", "#tag2", "#tag3"]}

Transcript:
${transcript.substring(0, 3000)}`;

    const result = await model.generateContent(prompt);
    const response = result.response.text();
    
    // Extract JSON from response
    const jsonMatch = response.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error('Failed to extract JSON from AI response');
    }
    
    const seoData = JSON.parse(jsonMatch[0]);
    logger.info('Generated SEO description and tags');
    
    return seoData;
  } catch (error) {
    logger.error('Error generating SEO description:', error);
    throw error;
  }
}

// Generate subtitle in target language
export async function generateSubtitle(transcript, languageCode) {
  try {
    const model = genAI.getGenerativeModel({ model: cfg.geminiModel });
    
    const languageNames = {
      'en': 'English',
      'hi': 'Hindi',
      'es': 'Spanish'
    };
    
    const targetLanguage = languageNames[languageCode] || languageCode;
    
    const prompt = `Translate this transcript to ${targetLanguage} and format as subtitle entries.
Return ONLY a JSON array in this exact format:
[{"start": "0:00", "end": "0:05", "text": "Translated text here"}]

Keep the original timestamps. Translate only the text content.

Transcript:
${transcript.substring(0, 2000)}`;

    const result = await model.generateContent(prompt);
    const response = result.response.text();
    
    // Extract JSON from response
    const jsonMatch = response.match(/\[[\s\S]*\]/);
    if (!jsonMatch) {
      throw new Error('Failed to extract JSON from AI response');
    }
    
    const subtitles = JSON.parse(jsonMatch[0]);
    logger.info(`Generated ${languageCode} subtitles with ${subtitles.length} entries`);
    
    return subtitles;
  } catch (error) {
    logger.error(`Error generating ${languageCode} subtitle:`, error);
    throw error;
  }
}

// Legacy function for backward compatibility
export function buildPrompt(transcript, prevDescription) {
  return `Create YouTube timestamps and SEO description.\n\nTranscript:\n${transcript}\n\nCurrent Description:\n${prevDescription}`;
}

export async function generateFromPrompt(prompt) {
  const model = genAI.getGenerativeModel({ model: cfg.geminiModel });
  const result = await model.generateContent(prompt);
  return result.response.text();
}
