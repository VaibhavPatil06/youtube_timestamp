import { VertexAI } from '@google-cloud/vertexai';
import logger from '../utils/logger.js';
import cfg from '../config/index.js';
import fs from 'fs/promises';

const vertex_ai = new VertexAI({ project: cfg.gcpProject, location: 'us-central1' });
const modelName = cfg.geminiModel || 'gemini-1.5-flash';

const generativeModel = vertex_ai.getGenerativeModel({
  model: modelName,
});

/**
 * Transcribe audio using Gemini 1.5
 * @param {string} audioPath Path to the mp3 audio file
 */
export async function transcribeAudioWithGemini(audioPath) {
  try {
    const audioData = await fs.readFile(audioPath);
    const base64Audio = audioData.toString('base64');

    const prompt = `Please provide a full, clean transcript of this audio. 
    Instructions:
    - Preserve speaker clarity
    - Remove filler words (uh, um, like, etc.)
    - Keep natural sentence structure
    - Return clean plain text transcript`;

    const request = {
      contents: [
        {
          role: 'user',
          parts: [
            { inlineData: { data: base64Audio, mimeType: 'audio/mpeg' } },
            { text: prompt },
          ],
        },
      ],
    };

    const result = await generativeModel.generateContent(request);
    const response = result.response;
    const transcript = response.candidates[0].content.parts[0].text;

    return transcript;
  } catch (error) {
    logger.error('Error in transcribeAudioWithGemini:', error);
    throw error;
  }
}

/**
 * Generate structured timestamps from transcript
 * @param {string} transcript 
 */
export async function generateTimestampsFromTranscript(transcript) {
  try {
    const prompt = `Generate structured timestamps for a YouTube video based on this transcript.
    Requirements:
    - Minimum 8 chapters
    - First timestamp must be 0:00
    - Format: 0:00 - Introduction
    - Return ONLY a JSON array of objects with "timestamp" and "title" keys.
    
    Example:
    [
      { "timestamp": "0:00", "title": "Introduction" },
      { "timestamp": "2:15", "title": "Topic" }
    ]

    Transcript:
    ${transcript}`;

    const request = {
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
    };

    const result = await generativeModel.generateContent(request);
    const response = result.response;
    const text = response.candidates[0].content.parts[0].text;

    // Extract JSON
    const jsonMatch = text.match(/\[[\s\S]*\]/);
    if (!jsonMatch) throw new Error('Failed to extract JSON from Gemini response');
    
    return JSON.parse(jsonMatch[0]);
  } catch (error) {
    logger.error('Error in generateTimestampsFromTranscript:', error);
    throw error;
  }
}

/**
 * Generate SEO optimized description and hashtags
 * @param {string} transcript 
 * @param {string} currentDescription 
 */
export async function generateDescriptionFromTranscript(transcript, currentDescription = '') {
  try {
    const prompt = `Generate an SEO optimized YouTube description based on this transcript.
    Requirements:
    - First 2 lines engaging hook
    - Bullet highlights
    - Call to action
    - 15 relevant hashtags
    - Return ONLY a JSON object with "description" (string) and "hashtags" (array of strings) keys.

    Transcript:
    ${transcript.substring(0, 5000)}`; // Basic truncation for safety

    const request = {
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
    };

    const result = await generativeModel.generateContent(request);
    const response = result.response;
    const text = response.candidates[0].content.parts[0].text;

    // Extract JSON
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error('Failed to extract JSON from Gemini response');

    return JSON.parse(jsonMatch[0]);
  } catch (error) {
    logger.error('Error in generateDescriptionFromTranscript:', error);
    throw error;
  }
}

// Keep legacy exports for transition if needed
export const generateTimestamps = generateTimestampsFromTranscript;
export const generateSEODescription = generateDescriptionFromTranscript;
