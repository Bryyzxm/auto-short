import React, {useState, useRef} from 'react';
import {UploadIcon, SparklesIcon, InfoIcon} from './icons';

interface ManualTranscriptUploadProps {
 videoId: string;
 existingSegments: any[];
 onSuccess: (updatedSegments: any[]) => void;
 onError: (error: string) => void;
 backendUrl: string;
}

interface UploadStats {
 totalSegments: number;
 matchedSegments: number;
 transcriptEntries: number;
 filename: string;
 fileSize: number;
}

export const ManualTranscriptUpload: React.FC<ManualTranscriptUploadProps> = ({videoId, existingSegments, onSuccess, onError, backendUrl}) => {
 const [isUploading, setIsUploading] = useState(false);
 const [isDragOver, setIsDragOver] = useState(false);
 const [uploadProgress, setUploadProgress] = useState<string>('');
 const [successStats, setSuccessStats] = useState<UploadStats | null>(null);
 const fileInputRef = useRef<HTMLInputElement>(null);

 const handleFileSelect = (file: File) => {
  if (!file) return;

  // Validate file type
  const validExtensions = ['.srt', '.txt'];
  const fileExtension = '.' + file.name.split('.').pop()?.toLowerCase();

  if (!validExtensions.includes(fileExtension)) {
   onError('File type not supported. Please upload a .srt or .txt file.');
   return;
  }

  // Validate file size (2MB limit)
  const maxSize = 2 * 1024 * 1024; // 2MB
  if (file.size > maxSize) {
   onError('File too large. Please upload a file smaller than 2MB.');
   return;
  }

  uploadTranscript(file);
 };

 const uploadTranscript = async (file: File) => {
  setIsUploading(true);
  setUploadProgress('Preparing upload...');
  setSuccessStats(null);

  try {
   console.log(`[MANUAL-TRANSCRIPT] Uploading ${file.name} for video ${videoId}`);

   const formData = new FormData();
   formData.append('transcriptFile', file);
   formData.append('videoId', videoId);
   formData.append('segments', JSON.stringify(existingSegments));

   setUploadProgress('Processing transcript...');

   const response = await fetch(`${backendUrl}/api/upload-transcript`, {
    method: 'POST',
    body: formData,
   });

   const result = await response.json();

   if (!response.ok) {
    throw new Error(result.message || result.error || 'Upload failed');
   }

   console.log(`[MANUAL-TRANSCRIPT] ✅ Upload successful:`, result);

   // Handle different response formats
   const segments = result.data.segments;
   const stats = result.data.transcriptStats || result.data.stats;

   // Create upload stats for display
   const uploadStats: UploadStats = {
    totalSegments: segments.length,
    matchedSegments: segments.filter((s: any) => s.hasManualTranscript).length,
    transcriptEntries: stats?.totalSegments || segments.length,
    filename: file.name,
    fileSize: file.size,
   };

   setSuccessStats(uploadStats);
   onSuccess(segments);
  } catch (error: any) {
   console.error('[MANUAL-TRANSCRIPT] ❌ Upload failed:', error);
   onError(error.message || 'Failed to upload transcript. Please try again.');
  } finally {
   setIsUploading(false);
   setUploadProgress('');
  }
 };

 const handleDragOver = (e: React.DragEvent) => {
  e.preventDefault();
  setIsDragOver(true);
 };

 const handleDragLeave = (e: React.DragEvent) => {
  e.preventDefault();
  setIsDragOver(false);
 };

 const handleDrop = (e: React.DragEvent) => {
  e.preventDefault();
  setIsDragOver(false);

  const files = e.dataTransfer.files;
  if (files.length > 0) {
   handleFileSelect(files[0]);
  }
 };

 const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
  const files = e.target.files;
  if (files && files.length > 0) {
   handleFileSelect(files[0]);
  }
 };

 const openFileDialog = () => {
  fileInputRef.current?.click();
 };

 return (
  <div className="mt-6 p-6 bg-gray-800 rounded-lg border border-gray-600">
   <div className="flex items-center mb-4">
    <UploadIcon className="w-5 h-5 text-purple-400 mr-2" />
    <h3 className="text-lg font-semibold text-purple-300">Upload Transcript Manually</h3>
   </div>

   <div className="mb-4 p-3 bg-blue-900/30 border border-blue-600/30 rounded-lg">
    <div className="flex items-start">
     <InfoIcon className="w-4 h-4 text-blue-400 mr-2 mt-0.5 flex-shrink-0" />
     <div className="text-sm text-blue-200">
      <p className="font-medium mb-1">Saat ini transcript belum bisa ditampilkan otomatis.</p>
      <p>Upload file transcript (.srt atau .txt) untuk menampilkan teks yang sesuai dengan setiap segmen video.</p>
     </div>
    </div>
   </div>

   {!isUploading && !successStats && (
    <>
     {/* File Upload Area */}
     <div
      className={`border-2 border-dashed rounded-lg p-8 text-center transition-colors duration-200 cursor-pointer ${isDragOver ? 'border-purple-400 bg-purple-900/20' : 'border-gray-500 hover:border-purple-500 hover:bg-gray-700/50'}`}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      onClick={openFileDialog}
     >
      <UploadIcon className="w-12 h-12 text-gray-400 mx-auto mb-4" />
      <p className="text-lg font-medium text-gray-300 mb-2">Drop your transcript file here</p>
      <p className="text-sm text-gray-500 mb-4">or click to browse files</p>
      <p className="text-xs text-gray-600">Supported formats: .srt, .txt • Max size: 2MB</p>
     </div>

     <input
      ref={fileInputRef}
      type="file"
      accept=".srt,.txt"
      onChange={handleFileInputChange}
      className="hidden"
     />

     {/* Format Examples */}
     <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-4">
      <div className="p-3 bg-gray-700/50 rounded-lg">
       <h4 className="text-sm font-medium text-gray-300 mb-2">SRT Format:</h4>
       <pre className="text-xs text-gray-400 font-mono whitespace-pre-wrap">
        {`1
00:00:20,000 --> 00:00:24,400
Welcome to this video tutorial

2
00:00:25,600 --> 00:00:30,400
Today we'll learn about...`}
       </pre>
      </div>

      <div className="p-3 bg-gray-700/50 rounded-lg">
       <h4 className="text-sm font-medium text-gray-300 mb-2">TXT Format:</h4>
       <pre className="text-xs text-gray-400 font-mono whitespace-pre-wrap">
        {`[00:20 - 00:24] Welcome to this video tutorial
[00:25 - 00:30] Today we'll learn about...
[01:15 - 01:45] Important concept here...`}
       </pre>
      </div>
     </div>
    </>
   )}

   {/* Upload Progress */}
   {isUploading && (
    <div className="text-center py-8">
     <div className="inline-flex items-center">
      <svg
       className="animate-spin w-5 h-5 mr-3 text-purple-400"
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
      <span className="text-purple-300 font-medium">{uploadProgress}</span>
     </div>
    </div>
   )}

   {/* Success Stats */}
   {successStats && (
    <div className="py-6">
     <div className="flex items-center mb-4">
      <SparklesIcon className="w-5 h-5 text-green-400 mr-2" />
      <span className="text-green-300 font-semibold">Transcript uploaded successfully!</span>
     </div>

     <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
      <div className="text-center p-3 bg-gray-700/50 rounded-lg">
       <div className="text-2xl font-bold text-green-400">{successStats.matchedSegments}</div>
       <div className="text-xs text-gray-400">Segments Matched</div>
      </div>
      <div className="text-center p-3 bg-gray-700/50 rounded-lg">
       <div className="text-2xl font-bold text-blue-400">{successStats.totalSegments}</div>
       <div className="text-xs text-gray-400">Total Segments</div>
      </div>
      <div className="text-center p-3 bg-gray-700/50 rounded-lg">
       <div className="text-2xl font-bold text-purple-400">{successStats.transcriptEntries}</div>
       <div className="text-xs text-gray-400">Transcript Entries</div>
      </div>
      <div className="text-center p-3 bg-gray-700/50 rounded-lg">
       <div className="text-2xl font-bold text-gray-400">{Math.round(successStats.fileSize / 1024)}KB</div>
       <div className="text-xs text-gray-400">File Size</div>
      </div>
     </div>

     <div className="text-center">
      <button
       onClick={() => {
        setSuccessStats(null);
        if (fileInputRef.current) {
         fileInputRef.current.value = '';
        }
       }}
       className="inline-flex items-center px-4 py-2 text-sm font-medium text-purple-300 bg-purple-900/30 border border-purple-600 rounded-lg hover:bg-purple-900/50 transition-colors"
      >
       Upload Another File
      </button>
     </div>
    </div>
   )}
  </div>
 );
};
