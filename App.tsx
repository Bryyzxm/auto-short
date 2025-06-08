import React, { useState, useCallback } from 'react';
import { YouTubeInputForm } from './components/YouTubeInputForm';
import { ShortVideoCard } from './components/ShortVideoCard';
import { LoadingSpinner } from './components/LoadingSpinner';
import { generateShortsIdeas } from './services/geminiService';
import type { ShortVideo } from './types';
import { getYouTubeVideoId } from './utils/youtubeUtils';
import { InfoIcon } from './components/icons';

const App: React.FC = () => {
  const [youtubeUrl, setYoutubeUrl] = useState<string>('');
  const [generatedShorts, setGeneratedShorts] = useState<ShortVideo[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [apiKeyError, setApiKeyError] = useState<string | null>(null);
  const [activePlayerId, setActivePlayerId] = useState<string | null>(null);

  // Check for API key on mount
  React.useEffect(() => {
    if (!process.env.API_KEY) {
      setApiKeyError("Gemini API Key is not configured. Please set the API_KEY environment variable.");
      console.error("Gemini API Key is missing (process.env.API_KEY).");
    }
  }, []);

  const handleSubmit = useCallback(async (url: string) => {
    if (apiKeyError) return;

    setYoutubeUrl(url);
    setIsLoading(true);
    setError(null);
    setGeneratedShorts([]);
    setActivePlayerId(null); // Reset active player on new submission

    const videoId = getYouTubeVideoId(url);
    if (!videoId) {
      setError("Invalid YouTube URL. Please enter a valid URL.");
      setIsLoading(false);
      return;
    }

    try {
      const ideas = await generateShortsIdeas(url); 
      if (ideas.length === 0) {
        setError("No short video segments could be identified. Try a different video.");
      } else {
        const shortsWithVideoId: ShortVideo[] = ideas.map((idea, index) => ({
          ...idea,
          youtubeVideoId: videoId,
          // Thumbnail is now less critical as we embed player, but good for initial load
          thumbnailUrl: `https://i.ytimg.com/vi/${videoId}/mqdefault.jpg`, 
        }));
        setGeneratedShorts(shortsWithVideoId);
      }
    } catch (e: any) {
      console.error("Error generating short video segments:", e);
      setError(e.message || "Failed to identify short video segments. Check console for details.");
    } finally {
      setIsLoading(false);
    }
  }, [apiKeyError]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-purple-900 to-blue-900 text-gray-100 flex flex-col items-center p-4 sm:p-8 selection:bg-purple-500 selection:text-white">
      <header className="w-full max-w-4xl mb-8 text-center">
        <h1 className="text-4xl sm:text-5xl font-bold tracking-tight text-transparent bg-clip-text bg-gradient-to-r from-purple-400 via-pink-400 to-red-400">
          AI YouTube to Shorts Segmenter
        </h1>
        <p className="mt-3 text-lg text-gray-300">
          Identifikasi segmen kunci dari video YouTube dan lihat konsep klip pendeknya langsung di sini. Ditenagai oleh AI.
        </p>
      </header>

      <main className="w-full max-w-2xl bg-gray-800 bg-opacity-70 backdrop-blur-md shadow-2xl rounded-xl p-6 sm:p-8">
        {apiKeyError && (
          <div className="mb-6 p-4 bg-red-700 bg-opacity-50 text-red-100 border border-red-500 rounded-lg">
            <h3 className="font-semibold text-lg">Configuration Error</h3>
            <p>{apiKeyError}</p>
          </div>
        )}
        <YouTubeInputForm onSubmit={handleSubmit} isLoading={isLoading} disabled={!!apiKeyError} />

        {isLoading && <LoadingSpinner />}

        {error && (
          <div className="mt-6 p-4 bg-red-800 bg-opacity-70 text-red-200 border border-red-600 rounded-lg text-center">
            <p className="font-semibold">Error:</p>
            <p>{error}</p>
          </div>
        )}

        {generatedShorts.length > 0 && (
          <div className="mt-8">
            <h2 className="text-2xl font-semibold mb-6 text-gray-200 text-center">Konsep Klip Pendek yang Disarankan</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6"> {/* Adjusted to 2 columns for better player fit */}
              {generatedShorts.map((short) => (
                <ShortVideoCard 
                  key={short.id} 
                  shortVideo={short} 
                  isActivePlayer={activePlayerId === short.id}
                  setActivePlayerId={setActivePlayerId}
                />
              ))}
            </div>
          </div>
        )}
        
        {!isLoading && !error && generatedShorts.length === 0 && youtubeUrl && !apiKeyError && (
           <div className="mt-6 p-4 bg-gray-700 bg-opacity-50 text-gray-300 border border-gray-600 rounded-lg text-center">
             <p>Tidak ada hasil untuk ditampilkan. Masukkan URL YouTube dan klik "Generate Clip Segments" untuk melihat saran bertenaga AI.</p>
           </div>
        )}

        <div className="mt-10 p-4 bg-yellow-700 bg-opacity-30 text-yellow-200 border border-yellow-600 rounded-lg text-sm flex items-start space-x-3">
          <InfoIcon className="w-6 h-6 flex-shrink-0 mt-0.5 text-yellow-400" />
          <div>
            <h4 className="font-semibold text-yellow-100">Penting: Pratinjau Tertanam & Simulasi Unduhan</h4>
            <p>Aplikasi ini menggunakan AI untuk **mengidentifikasi segmen** video dan **menampilkannya sebagai konsep klip pendek** menggunakan pemutar YouTube yang disematkan.</p>
            <p className="mt-1">Setiap kartu akan menampilkan pemutar video untuk segmen yang disarankan. Anda dapat menonton konsep klip pendek ini langsung di sini.</p>
            <p className="mt-1">
              **Pengunduhan file video pendek secara langsung tidak dimungkinkan dalam demo ini** karena batasan teknis browser dan Ketentuan Layanan YouTube.
              Tombol "Download" bersifat simulasi dan akan memberikan detail segmen.
            </p>
            <p className="mt-1">Dalam aplikasi produksi penuh, fitur pengunduhan video memerlukan infrastruktur backend (server) untuk memproses dan menyediakan file video.</p>
          </div>
        </div>
      </main>

      <footer className="w-full max-w-4xl mt-12 text-center text-gray-500">
        <p>&copy; {new Date().getFullYear()} AI Shorts Segmenter. Demonstrasi Konsep.</p>
      </footer>
    </div>
  );
};

export default App;