import React, {useState} from 'react';
import {SparklesIcon} from './icons';

interface YouTubeInputFormProps {
 onSubmit: (url: string, aspectRatio: string) => void;
 onUrlChange?: (url: string) => void; // New prop to notify parent of URL changes
 isLoading: boolean;
 disabled?: boolean;
 aspectRatio: string;
 setAspectRatio: (v: string) => void;
}

export const YouTubeInputForm: React.FC<YouTubeInputFormProps> = ({onSubmit, onUrlChange, isLoading, disabled, aspectRatio, setAspectRatio}) => {
 const [url, setUrl] = useState<string>('');
 const [inputError, setInputError] = useState<string | null>(null);

 const handleSubmit = (e: React.FormEvent) => {
  e.preventDefault();
  if (!url.trim()) {
   setInputError('YouTube URL tidak boleh kosong.');
   return;
  }
  if (!url.includes('youtube.com/') && !url.includes('youtu.be/')) {
   setInputError('Masukkan URL YouTube yang valid.');
   return;
  }
  setInputError(null);
  onSubmit(url, aspectRatio);
 };

 return (
  <form
   onSubmit={handleSubmit}
   className="space-y-6"
  >
   {/* Input URL YouTube */}
   <div>
    <label
     htmlFor="youtubeUrl"
     className="block text-sm font-medium text-gray-300 mb-1"
    >
     URL Video YouTube
    </label>
    <input
     type="url"
     id="youtubeUrl"
     name="youtubeUrl"
     value={url}
     onChange={(e) => {
      const newUrl = e.target.value;
      setUrl(newUrl);
      if (inputError) setInputError(null);
      // Notify parent component of URL changes immediately
      onUrlChange?.(newUrl);
     }}
     placeholder="cth: https://www.youtube.com/watch?v=dQw4w9WgXcQ"
     className="w-full px-4 py-3 bg-gray-700 text-gray-100 border border-gray-600 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500 outline-none transition-colors duration-200 placeholder-gray-500"
     disabled={isLoading ?? disabled}
     aria-describedby={inputError ? 'youtube-url-error' : undefined}
    />
    {inputError && (
     <p
      id="youtube-url-error"
      className="mt-2 text-sm text-red-400"
     >
      {inputError}
     </p>
    )}
   </div>
   <div>
    <span className="block text-sm font-medium text-gray-300 mb-1">Rasio Video Output</span>
    <div className="flex space-x-4">
     <label className="inline-flex items-center">
      <input
       type="radio"
       name="aspectRatio"
       value="9:16"
       checked={aspectRatio === '9:16'}
       onChange={() => setAspectRatio('9:16')}
       className="form-radio text-purple-600"
       disabled={isLoading ?? disabled}
      />
      <span className="ml-2">9:16 (Vertikal)</span>
     </label>
     <label className="inline-flex items-center">
      <input
       type="radio"
       name="aspectRatio"
       value="original"
       checked={aspectRatio === 'original'}
       onChange={() => setAspectRatio('original')}
       className="form-radio text-purple-600"
       disabled={isLoading ?? disabled}
      />
      <span className="ml-2">Rasio Asli</span>
     </label>
    </div>
   </div>
   <button
    type="submit"
    disabled={isLoading ?? disabled}
    className="w-full flex items-center justify-center px-6 py-3 border border-transparent text-base font-medium rounded-lg shadow-sm text-white bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-700 hover:to-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-gray-800 focus:ring-purple-500 transition-all duration-200 ease-in-out transform hover:scale-105 disabled:opacity-50 disabled:cursor-not-allowed"
   >
    {isLoading ? (
     <>
      <svg
       className="animate-spin -ml-1 mr-3 h-5 w-5 text-white"
       xmlns="http://www.w3.org/2000/svg"
       fill="none"
       viewBox="0 0 24 24"
      >
       <circle
        className="opacity-25"
        cx="12"
        cy="12"
        r="10"
        stroke="currentColor"
        strokeWidth="4"
       ></circle>
       <path
        className="opacity-75"
        fill="currentColor"
        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
       ></path>
      </svg>
      Menghasilkan Segmen...
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
