# =============================================================================

# VERCEL DEPLOYMENT - ENVIRONMENT VARIABLES TEMPLATE

# =============================================================================

# Copy nilai-nilai ini ke Vercel Environment Variables dashboard

# 🌐 BACKEND API URL

# Ganti dengan URL Railway yang akan Anda dapatkan nanti

VITE_BACKEND_URL=https://auto-short-production.up.railway.app

# 🤖 GROQ AI API KEY

# Dapatkan GRATIS dari: https://console.groq.com/keys

# Contoh: gsk_xxxxxxxxxxxxxxxxxxxxxxxxxxxxx

VITE_GROQ_API_KEY=your_groq_api_key_here

# 🔧 ENVIRONMENT

NODE_ENV=production

# =============================================================================

# LANGKAH-LANGKAH SETUP DI VERCEL DASHBOARD:

# =============================================================================

# 1. Buka project Vercel Anda

# 2. Klik tab "Settings"

# 3. Klik "Environment Variables" di sidebar

# 4. Tambahkan setiap variable di atas dengan nilai yang sesuai

# 5. Set "Environment" ke: Production, Preview, Development (semua)

# 6. Klik "Save"

# 7. Redeploy project

# =============================================================================

# CARA MENDAPATKAN GROQ API KEY:

# =============================================================================

# 1. Buka https://console.groq.com/

# 2. Login/Register (GRATIS)

# 3. Klik "API Keys" di sidebar

# 4. Klik "Create API Key"

# 5. Copy API key yang dihasilkan

# 6. Paste ke VITE_GROQ_API_KEY

# =============================================================================

# NOTES PENTING:

# =============================================================================

# - VITE_BACKEND_URL akan diupdate setelah Railway deployment selesai

# - Semua env vars harus diawali "VITE\_" untuk frontend Vite

# - Jangan commit file .env ke Git (sudah di .gitignore)
