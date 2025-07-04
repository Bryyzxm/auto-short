# Backend AI YouTube to Shorts Segmenter

## Fitur

- Endpoint POST `/api/shorts` untuk memotong video YouTube menjadi segmen pendek vertikal 9:16.
- Output file siap download di folder `outputs/`.

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
