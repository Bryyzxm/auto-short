// Quick test script to check available Gemini models
import {GoogleGenAI} from '@google/genai';

const API_KEY = 'your-api-key-here'; // Replace with actual key
const ai = new GoogleGenAI({apiKey: API_KEY});

const testModels = ['gemini-1.5-pro', 'gemini-1.5-flash', 'gemini-pro', 'gemini-1.0-pro', 'gemini-1.5-pro-latest'];

async function testModelAvailability() {
 for (const modelName of testModels) {
  try {
   console.log(`Testing model: ${modelName}`);
   const response = await ai.models.generateContent({
    model: modelName,
    contents: 'Test message',
    config: {
     maxOutputTokens: 100,
     temperature: 0.1,
    },
   });
   console.log(`✅ ${modelName} - AVAILABLE`);
  } catch (error) {
   console.log(`❌ ${modelName} - NOT AVAILABLE: ${error.message}`);
  }
 }
}

testModelAvailability();
