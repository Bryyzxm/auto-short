import path from 'path';
import { defineConfig, loadEnv } from 'vite';

export default defineConfig(({ mode }) => {
    const env = loadEnv(mode, '.', '');
    console.log('VITE_GEMINI_API_KEY from env:', env.VITE_GEMINI_API_KEY); // Debugging line
    return {
      base: '/auto-short/',
      define: {
        'process.env.GEMINI_API_KEY': JSON.stringify(env.VITE_GEMINI_API_KEY),
        'process.env.API_KEY': JSON.stringify(env.VITE_GEMINI_API_KEY) 
      },
      resolve: {
        alias: {
          '@': path.resolve(__dirname, '.'),
        }
      }
    };
});
