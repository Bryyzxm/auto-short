# Deployment Troubleshooting Guide

## Masalah yang Ditemukan

Setelah analisis log Railway deployment, ditemukan beberapa masalah utama:

### 1. yt-dlp dan whisper.cpp Tidak Ditemukan
```
❌ yt-dlp NOT found in any of these locations: /usr/local/bin/yt-dlp, /usr/bin/yt-dlp, yt-dlp, yt-dlp.exe
❌ whisper.cpp NOT found in any of these locations: /app/bin/main, /app/bin/whisper, /app/whisper.cpp/main
```

### 2. Nixpacks Tidak Menjalankan Fase Build
File yang ada di `/app` hanya:
- `.nixpacks`
- `README.md` 
- `node_modules`
- `package-lock.json`
- `package.json`
- `server.js`

Direktori `/app/bin` dan `/app/models` tidak ada, menunjukkan fase build di `nixpacks.toml` tidak dieksekusi.

## Solusi yang Diterapkan

### 1. Beralih ke Dockerfile
Membuat `railway.json` untuk memaksa Railway menggunakan Dockerfile:
```json
{
  "build": {
    "builder": "DOCKERFILE",
    "dockerfilePath": "Dockerfile"
  }
}
```

### 2. Startup Script yang Robust
Membuat `start.sh` yang:
- Memastikan direktori `/app/bin`, `/app/models`, `/app/outputs` ada
- Menginstall `yt-dlp` jika belum ada
- Membangun `whisper.cpp` jika belum ada
- Mengunduh model whisper jika belum ada
- Memverifikasi semua instalasi sebelum memulai aplikasi

### 3. Enhanced Logging
Menambahkan logging detail di `server.js` untuk:
- Menampilkan PATH environment
- Mengecek direktori kritis
- Menampilkan file yang ada di setiap direktori

### 4. Dynamic Path Detection
Server sekarang mencari binary di multiple lokasi:
- yt-dlp: `/usr/local/bin/yt-dlp`, `/usr/bin/yt-dlp`, `yt-dlp`, `yt-dlp.exe`
- whisper: `/app/bin/main`, `/app/bin/whisper`, `/app/whisper.cpp/main`, dll

## Langkah Deploy

1. **Commit semua perubahan:**
   ```bash
   git add .
   git commit -m "Fix deployment with Dockerfile and startup script"
   git push
   ```

2. **Deploy ke Railway:**
   ```bash
   railway up
   ```

3. **Monitor log deployment:**
   ```bash
   railway logs
   ```

## Verifikasi Deployment

Setelah deployment berhasil, log harus menampilkan:
```
✅ yt-dlp: OK
✅ whisper.cpp: OK  
✅ whisper model: OK
🎉 Setup complete! Starting application...
```

## Troubleshooting Tambahan

Jika masih ada masalah:

1. **Cek log build:**
   ```bash
   railway logs --deployment
   ```

2. **Cek environment variables:**
   - Pastikan `GEMINI_API_KEY` sudah diset di Railway dashboard

3. **Cek resource limits:**
   - Build whisper.cpp membutuhkan memory yang cukup
   - Pastikan Railway plan mendukung resource yang dibutuhkan

4. **Fallback ke Nixpacks:**
   Jika Dockerfile bermasalah, hapus `railway.json` untuk kembali ke Nixpacks

## File yang Dimodifikasi

- `railway.json` - Konfigurasi Railway untuk menggunakan Dockerfile
- `start.sh` - Script startup yang robust
- `Dockerfile` - Updated untuk menggunakan start.sh
- `.dockerignore` - Updated untuk include start.sh
- `server.js` - Enhanced logging dan path detection
- `DEPLOYMENT_TROUBLESHOOTING.md` - Dokumentasi ini