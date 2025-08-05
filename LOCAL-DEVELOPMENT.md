# Local Development Guide

## 🚀 Cara Menjalankan Aplikasi Lokal

### Option 1: Frontend Lokal + Backend Production (Recommended)

Ideal untuk development frontend saja tanpa perlu setup backend.

```bash
# 1. Install dependencies
npm install

# 2. Start frontend development server
npm run dev
```

✅ **Keuntungan:**

- Setup cepat, tidak perlu backend lokal
- Menggunakan backend Azure yang sudah stabil
- Cocok untuk development UI/UX

### Option 2: Frontend Lokal + Backend Lokal (Full Stack Development)

Jika ingin mengembangkan backend juga.

```bash
# Terminal 1: Start Backend
cd backend
npm install
npm start
# Backend akan berjalan di http://localhost:5001

# Terminal 2: Start Frontend
# Edit .env.local dan uncomment:
# VITE_BACKEND_URL=http://localhost:5001

npm run dev
# Frontend akan berjalan di http://localhost:5173
```

✅ **Keuntungan:**

- Full control atas backend
- Bisa debug backend API
- Cocok untuk pengembangan fitur baru

## 🔧 Environment Configuration

### .env.local (Local Development)

```bash
# Backend URL - pilih salah satu:
VITE_BACKEND_URL=https://auto-short.azurewebsites.net  # Production backend
# VITE_BACKEND_URL=http://localhost:5001                      # Local backend

# API Keys
VITE_GROQ_API_KEY=your_groq_key_here
VITE_GEMINI_API_KEY=your_gemini_key_here
```

### Vercel Environment (Production)

```bash
VITE_BACKEND_URL=https://auto-short.azurewebsites.net
VITE_GROQ_API_KEY=your_production_groq_key
VITE_GEMINI_API_KEY=your_production_gemini_key
```

## 🔍 Troubleshooting

### Console menunjukkan "Using backend URL: ..."

- ✅ Normal: Menunjukkan backend mana yang sedang digunakan
- 🔍 Check: Pastikan URL yang ditampilkan sesuai ekspektasi

### CORS Errors

- ❌ Pastikan backend URL benar di .env.local
- 🔧 Jika menggunakan backend lokal, pastikan CORS diaktifkan
- ✅ Backend Azure sudah configured untuk CORS

### 404 API Errors

- 🔍 Check: Apakah backend URL dapat diakses langsung
- 🔧 Test: Buka https://auto-short.azurewebsites.net/health
- ⏳ Wait: Backend Azure mungkin butuh waktu startup (cold start)
