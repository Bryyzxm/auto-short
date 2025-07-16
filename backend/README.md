# Backend Server

Backend Express.js untuk AI YouTube to Shorts Segmenter.

## Fitur

- **Download & Cut Video**: Menggunakan yt-dlp dan ffmpeg untuk memproses video
- **Transcript Service**: Mengunduh dan memproses subtitle YouTube dengan caching
- **CORS Support**: Mendukung cross-origin requests dari frontend

## Endpoints

### POST /api/shorts
Memproses video YouTube menjadi segmen pendek.

**Body:**
```json
{
  "youtubeUrl": "https://www.youtube.com/watch?v=...",
  "start": 30,
  "end": 90,
  "aspectRatio": "9:16"
}
```

### GET /api/yt-transcript?videoId=...
Mengambil transkrip video YouTube dengan sistem caching yang telah diperbaiki.

**Features:**
- ✅ **Caching System**: Menghindari download berulang untuk video yang sama
- ✅ **Error Handling**: Logging yang lebih baik dan error messages yang informatif  
- ✅ **File Cleanup**: Otomatis membersihkan file VTT lama
- ✅ **Fallback Support**: Menggunakan file VTT yang sudah ada jika tersedia

**Query Parameters:**
- `videoId` (required): YouTube video ID
- `lang` (optional): Bahasa subtitle (default: "id,en")

### GET /api/video-metadata?videoId=VIDEO_ID
Mendapatkan metadata video YouTube menggunakan yt-dlp (menghindari CORS error).

**Response:**
```json
{
  "videoId": "VIDEO_ID",
  "title": "Video Title",
  "duration": 300,
  "uploader": "Channel Name",
  "upload_date": "20231201",
  "view_count": 12345,
  "description": "Video description..."
}
```

**Features:**
- **CORS-Free**: Menghindari Cross-Origin Request Blocked error
- **Fast Metadata**: Menggunakan `--dump-json` tanpa download video
- **Timeout Protection**: 30 detik timeout untuk mencegah hanging
- **Error Handling**: Penanganan error yang robust dengan logging detail

## Perbaikan Terbaru

### Masalah yang Diperbaiki:
1. **Error 500 saat fetch transkrip** - Ditambahkan error handling yang lebih robust
2. **File VTT menumpuk** - Sistem cleanup otomatis saat server start
3. **Logging yang kurang informatif** - Ditambahkan logging detail untuk debugging

### Sistem Caching:
- Transkrip disimpan dalam memory cache berdasarkan videoId
- Menghindari download berulang untuk video yang sama
- Menggunakan file VTT yang sudah ada jika tersedia

## Dependencies

- express
- cors  
- uuid
- node-fetch
- yt-dlp (external binary)
- ffmpeg (external binary)

## Usage

```bash
npm install
node server.js
```

Server akan berjalan di `http://localhost:5001`

## Cara Menjalankan Backend

1. **Masuk ke folder backend:**
   ```powershell
   cd backend
   ```
2. **Install dependencies Node.js:**
   ```powershell
   npm install
   ```
3. **Install yt-dlp:**
   - Download yt-dlp.exe dari https://github.com/yt-dlp/yt-dlp/releases/latest
   - Simpan di folder backend, rename jadi `yt-dlp.exe` (atau pastikan ada di PATH)
   - Atau install via pip (jika ada Python):
     ```powershell
     pip install -U yt-dlp
     ```
4. **Install ffmpeg:**

   - Download dari https://www.gyan.dev/ffmpeg/builds/ (pilih release full, extract, tambahkan ke PATH)
   - Atau install via package manager (jika ada)

5. **Jalankan backend:**

   ```powershell
   npm run dev
   ```

   atau

   ```powershell
   node server.js
   ```

6. **Akses endpoint:**
   - POST ke `http://localhost:5001/api/shorts` dengan body JSON:
     ```json
     {
      "youtubeUrl": "https://www.youtube.com/watch?v=xxxx",
      "start": 30,
      "end": 90
     }
     ```
   - Akan mendapat link download file hasil di `/outputs/`.

## Catatan

- File hasil akan otomatis crop ke 9:16 (center crop).
- Pastikan yt-dlp dan ffmpeg bisa diakses dari command line (PATH).
- Untuk integrasi ke frontend, tinggal panggil endpoint ini dari React.
