# Run and deploy your AI Studio app

This contains everything you need to run your app locally.

## Run Locally

**Prerequisites:**  Node.js

1. Install dependencies:
   `npm install`
2. Setup API Key:
   - Copy `.env.example` to `.env.local`: `cp .env.example .env.local`
   - Dapatkan Gemini API key dari: https://makersuite.google.com/app/apikey
   - Edit `.env.local` dan ganti `your_gemini_api_key_here` dengan API key yang sebenarnya
3. Run the app:
   `npm run dev`
