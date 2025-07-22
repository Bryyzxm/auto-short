# 🔧 **Environment Variables Configuration**

## **Railway (Backend) Environment Variables**

Buka Railway Dashboard → Your Project → Variables, lalu tambahkan:

```bash
# ⚡ Required Variables
NODE_ENV=production
PORT=${PORT}  # Railway akan auto-assign port

# 🌐 CORS Configuration (PENTING!)
# Ganti dengan domain Vercel Anda yang sebenarnya
CORS_ORIGINS=https://auto-short.vercel.app,https://auto-short-git-main-bryyzxms-projects.vercel.app

# 🤖 Optional: AI Services (jika menggunakan AI features)
GROQ_API_KEY=your_groq_api_key_here
```

**Catatan Penting untuk CORS_ORIGINS:**

- Ganti `auto-short` dengan nama project Vercel Anda
- Jika menggunakan custom domain, tambahkan juga di sini
- Pisahkan multiple domains dengan koma tanpa spasi

## **Vercel (Frontend) Environment Variables**

Buka Vercel Dashboard → Your Project → Settings → Environment Variables:

```bash
# 🌐 Backend Connection (WAJIB!)
VITE_BACKEND_URL=https://your-railway-app.up.railway.app

# 🤖 AI Services
VITE_GROQ_API_KEY=your_groq_api_key_here
VITE_GEMINI_API_KEY=your_gemini_api_key_here

# 📊 Optional: Analytics/Monitoring
VITE_ENVIRONMENT=production
```

**Cara mendapatkan Railway URL:**

1. Buka Railway Dashboard → Your Project
2. Copy URL dari bagian "Deployments" atau "Settings"
3. Format: `https://your-app-name-production.up.railway.app`

## **Local Development (.env.local)**

Untuk development lokal, buat file `.env.local`:

```bash
# Backend URL (pilih salah satu)
VITE_BACKEND_URL=https://your-railway-app.up.railway.app  # Use production backend
# VITE_BACKEND_URL=http://localhost:5001  # Use local backend

# AI Services
VITE_GROQ_API_KEY=your_groq_key_here
VITE_GEMINI_API_KEY=your_gemini_key_here
```

## **Contoh Penggunaan di Frontend**

```typescript
// Akses environment variable di React component
const backendUrl = (import.meta as any).env.VITE_BACKEND_URL;
const groqApiKey = (import.meta as any).env.VITE_GROQ_API_KEY;

// Contoh implementasi API call
const createShort = async (youtubeUrl: string, start: number, end: number) => {
 const response = await fetch(`${backendUrl}/api/shorts`, {
  method: 'POST',
  headers: {
   'Content-Type': 'application/json',
  },
  body: JSON.stringify({youtubeUrl, start, end}),
 });

 if (!response.ok) {
  throw new Error('Failed to create short');
 }

 return response.json();
};
```

## **Testing Environment Variables**

### **Test di Local Development:**

```bash
# Jalankan frontend
npm run dev

# Check browser console untuk:
[CONFIG] Using backend URL: http://localhost:5001
```

### **Test di Production:**

```bash
# Test backend health
curl https://your-railway-app.up.railway.app/health

# Test frontend environment
# Buka browser developer console di Vercel app Anda, jalankan:
console.log('Backend URL:', (import.meta as any).env.VITE_BACKEND_URL);
```

---

**🚨 PENTING:** Pastikan tidak pernah commit file `.env` atau `.env.local` ke git repository!
