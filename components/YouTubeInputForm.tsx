
import React, { useState } from 'react';
import { SparklesIcon } from './icons'; 

interface YouTubeInputFormProps {
  onSubmit: (url: string) => void;
  isLoading: boolean;
  disabled?: boolean;
}

export const YouTubeInputForm: React.FC<YouTubeInputFormProps> = ({ onSubmit, isLoading, disabled }) => {
  const [url, setUrl] = useState<string>('');
  const [inputError, setInputError] = useState<string | null>(null);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!url.trim()) {
      setInputError("YouTube URL cannot be empty.");
      return;
    }
    // Basic URL validation (very simple, can be improved)
    if (!url.includes("youtube.com/") && !url.includes("youtu.be/")) {
        setInputError("Please enter a valid YouTube URL.");
        return;
    }
    setInputError(null);
    onSubmit(url);
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div>
        <label htmlFor="youtubeUrl" className="block text-sm font-medium text-gray-300 mb-1">
          YouTube Video URL
        </label>
        <input
          type="url"
          id="youtubeUrl"
          name="youtubeUrl"
          value={url}
          onChange={(e) => {
            setUrl(e.target.value);
            if (inputError) setInputError(null);
          }}
          placeholder="e.g., https://www.youtube.com/watch?v=dQw4w9WgXcQ"
          className="w-full px-4 py-3 bg-gray-700 text-gray-100 border border-gray-600 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500 outline-none transition-colors duration-200 placeholder-gray-500"
          disabled={isLoading || disabled}
          aria-describedby={inputError ? "youtube-url-error" : undefined}
        />
        {inputError && <p id="youtube-url-error" className="mt-2 text-sm text-red-400">{inputError}</p>}
      </div>
      <button
        type="submit"
        disabled={isLoading || disabled}
        className="w-full flex items-center justify-center px-6 py-3 border border-transparent text-base font-medium rounded-lg shadow-sm text-white bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-700 hover:to-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-gray-800 focus:ring-purple-500 transition-all duration-200 ease-in-out transform hover:scale-105 disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {isLoading ? (
          <>
            <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
            </svg>
            Generating Segments...
          </>
        ) : (
          <>
            <SparklesIcon className="w-5 h-5 mr-2" />
            Generate Clip Segments
          </>
        )}
      </button>
    </form>
  );
};
