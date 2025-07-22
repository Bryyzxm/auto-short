/**
 * AI TITLE GENERATOR SERVICE
 * Generates meaningful titles and descrip  const response = await this.groq.chat.completions.create({
   messages: [{ role: 'user', content: prompt }],
   model: 'llama-3.1-8b-instant',
   temperature: 0.3,
   max_tokens: 1500,
   response_format: { type: 'json_object' }
  });or video segments
 */

import Groq from 'groq-sdk';

class AITitleGeneratorService {
 constructor() {
  this.groq = process.env.GROQ_API_KEY
   ? new Groq({
      apiKey: process.env.GROQ_API_KEY,
     })
   : null;

  this.rateLimitDelay = 1000; // 1 second between requests
  this.lastRequestTime = 0;
  
  // Debug API key status
  if (process.env.GROQ_API_KEY) {
   console.log(`✅ [AI Title Generator] GROQ API key loaded: ${process.env.GROQ_API_KEY.substring(0, 7)}...`);
  } else {
   console.warn('⚠️ [AI Title Generator] No GROQ API key found in environment');
  }
 }

 // Main method: Generate titles and descriptions for segments
 async generateSegmentTitles(segments, videoContext = '') {
  if (!this.groq) {
   console.warn('[AI-TITLE] No GROQ API key, using fallback titles');
   return this.generateFallbackTitles(segments);
  }

  console.log(`[AI-TITLE] Generating titles for ${segments.length} segments`);

  try {
   const titlesData = await this.callGroqForTitles(segments, videoContext);
   return this.processTitlesResponse(titlesData, segments);
  } catch (error) {
   console.error('❌ [AI Title Generator] Groq API failed:', {
    error: error.message,
    segmentCount: segments.length,
    videoContext: videoContext,
    fallbackUsed: true,
   });

   console.log('🔄 [AI Title Generator] Using enhanced smart fallback system...');
   return this.generateFallbackTitles(segments);
  }
 }

 async callGroqForTitles(segments, videoContext) {
  await this.respectRateLimit();

  // Prepare segments data for AI with MORE CONTEXT
  const segmentTexts = segments.map((seg, index) => {
    // Get more context (up to 1000 chars) for better title generation
    const fullText = seg.text.substring(0, 1000);
    return `=== SEGMENT ${index + 1} (Durasi: ${seg.duration}s) ===\nTRANSKRIP LENGKAP:\n${fullText}\n`;
  }).join('\n');

  const prompt = `Kamu adalah AI yang ahli dalam content analysis dan title creation. Tugasmu adalah menganalisis transkrip video dan membuat judul yang AKURAT dan RELEVAN untuk setiap segmen.

KONTEKS VIDEO: ${videoContext || 'Video podcast/diskusi'}

${segmentTexts}

INSTRUKSI UTAMA:
1. BACA dan ANALISIS setiap transkrip segmen dengan teliti
2. IDENTIFIKASI topik utama yang BENAR-BENAR dibahas dalam segmen
3. BUAT judul yang merepresentasikan isi sebenarnya, BUKAN template generic

ATURAN KETAT:
- WAJIB membaca seluruh transkrip sebelum membuat judul
- Judul HARUS relevan 100% dengan isi segmen
- JANGAN menggunakan template random seperti "Tips Travel" jika tidak membahas travel
- FOKUS pada nama tokoh, perusahaan, atau topik spesifik yang disebutkan
- Maksimal 8 kata per judul
- Gunakan Bahasa Indonesia yang natural

CONTOH ANALISIS YANG BENAR:
Jika transkrip membahas "Niki Luhur CEO Fida cyber security" 
→ Judul yang BENAR: "CEO Fida Bahas Cyber Security"
→ Judul yang SALAH: "Tips Travel Backpacker" ❌

TEKNIK JUDUL MENARIK (pilih yang sesuai konten):
- Jika ada nama tokoh: "Pengakuan [Nama] tentang [Topik]"
- Jika ada perusahaan: "Rahasia Sukses [Perusahaan]"
- Jika ada masalah: "Solusi [Masalah] yang Mengejutkan"
- Jika ada tips: "Cara [Tokoh] Mengatasi [Masalah]"

FORMAT OUTPUT (JSON):
{
  "titles": [
    {
      "title": "Judul yang relevan dengan transkrip",
      "description": "Deskripsi 15-25 kata yang menjelaskan isi segmen secara akurat"
    }
  ]
}

PENTING: Pastikan setiap judul 100% akurat dengan isi transkrip. Jangan membuat judul clickbait yang menyesatkan.

RESPONSE (JSON saja):`;

  const response = await this.groq.chat.completions.create({
   messages: [{role: 'user', content: prompt}],
   model: 'llama-3.1-70b-versatile', // Use more powerful model
   temperature: 0.3, // Lower temperature for more accuracy
   max_tokens: 2500, // Increased for longer analysis
   response_format: {type: 'json_object'},
  });

  return response.choices[0]?.message?.content;
 }

 processTitlesResponse(responseText, segments) {
  try {
   const titlesData = JSON.parse(responseText);

   if (!titlesData.titles || !Array.isArray(titlesData.titles)) {
    throw new Error('Invalid titles format from AI');
   }

   const results = segments.map((segment, index) => {
    const aiTitle = titlesData.titles[index];

    return {
     ...segment,
     title: aiTitle?.title || this.generateFallbackTitle(segment.text),
     description: aiTitle?.description || `Segmen ${index + 1} dengan durasi ${segment.duration} detik`,
    };
   });

   console.log(`[AI-TITLE] ✅ Generated ${results.length} AI titles`);
   results.forEach((r, i) => {
    console.log(`[AI-TITLE] ${i + 1}: "${r.title}" - ${r.description}`);
   });

   return results;
  } catch (error) {
   console.error('[AI-TITLE] Error processing AI response:', error);
   return this.generateFallbackTitles(segments);
  }
 }

 generateFallbackTitles(segments) {
  return segments.map((segment, index) => ({
   ...segment,
   title: this.generateFallbackTitle(segment.text),
   description: this.generateFallbackDescription(segment.text, segment.duration),
  }));
 }

 generateFallbackTitle(text) {
  console.log(`🔍 [Fallback] Analyzing text: "${text.substring(0, 100)}..."`);
  
  // STEP 1: Extract entities and keywords
  const entities = this.extractEntitiesFromText(text);
  console.log(`📊 [Fallback] Extracted entities:`, entities);
  
  // STEP 2: Content-based title generation
  if (entities.people.length > 0 || entities.companies.length > 0) {
    return this.generateEntityBasedTitle(entities, text);
  }
  
  // STEP 3: Topic-based title generation with ACCURATE detection
  const detectedTopic = this.detectTopicFromContent(text);
  console.log(`🎯 [Fallback] Detected topic: ${detectedTopic}`);
  
  if (detectedTopic) {
    return this.generateTopicBasedTitle(detectedTopic, text);
  }
  
  // STEP 4: Fallback to content summary
  return this.generateContentSummaryTitle(text);
 }

 extractEntitiesFromText(text) {
  const cleanText = text.toLowerCase();
  
  // Extract people names (common Indonesian patterns)
  const peoplePatterns = [
    /(?:pak|bu|bapak|ibu|mas|mbak|bang|kang)\s+([a-z]+(?:\s+[a-z]+)?)/gi,
    /([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)[,\s].*(?:founder|ceo|direktur|ketua|presiden)/gi,
    /(?:saya|aku|nama saya|perkenalkan)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)/gi
  ];
  
  // Extract company/organization names
  const companyPatterns = [
    /(?:pt\s+|cv\s+|perusahaan\s+)([a-z\s]+)/gi,
    /(?:dari|di)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)[,\s].*(?:perusahaan|startup|company)/gi,
    /([A-Z][a-z]+)(?:\s+(?:inc|corp|ltd|group|teknologi|digital|solutions))/gi
  ];
  
  const people = [];
  const companies = [];
  
  // Extract people
  peoplePatterns.forEach(pattern => {
    const matches = [...text.matchAll(pattern)];
    matches.forEach(match => {
      if (match[1] && match[1].length > 2) {
        people.push(match[1].trim());
      }
    });
  });
  
  // Extract companies  
  companyPatterns.forEach(pattern => {
    const matches = [...text.matchAll(pattern)];
    matches.forEach(match => {
      if (match[1] && match[1].length > 2) {
        companies.push(match[1].trim());
      }
    });
  });
  
  // Extract topics/keywords
  const topics = this.extractTopicKeywords(text);
  
  return { people: [...new Set(people)], companies: [...new Set(companies)], topics };
 }
 
 generateEntityBasedTitle(entities, text) {
  const cleanText = text.toLowerCase();
  
  // Priority: People + Companies
  if (entities.people.length > 0 && entities.companies.length > 0) {
    const person = entities.people[0];
    const company = entities.companies[0];
    
    if (cleanText.includes('founder') || cleanText.includes('ceo')) {
      return `CEO ${company} Ungkap Rahasia Sukses`;
    }
    if (cleanText.includes('cyber') || cleanText.includes('security')) {
      return `${person} Bahas Ancaman Cyber Security`;
    }
    if (cleanText.includes('digital') || cleanText.includes('teknologi')) {
      return `Founder ${company} Soal Transformasi Digital`;
    }
    
    return `Pengakuan ${person} dari ${company}`;
  }
  
  // People only
  if (entities.people.length > 0) {
    const person = entities.people[0];
    if (cleanText.includes('pengalaman')) return `Pengalaman Menarik ${person}`;
    if (cleanText.includes('cerita')) return `Cerita Inspiratif ${person}`;
    if (cleanText.includes('tips')) return `Tips Sukses dari ${person}`;
    return `Wawancara Eksklusif dengan ${person}`;
  }
  
  // Companies only
  if (entities.companies.length > 0) {
    const company = entities.companies[0];
    if (cleanText.includes('startup')) return `Perjalanan Startup ${company}`;
    if (cleanText.includes('bisnis')) return `Strategi Bisnis ${company}`;
    if (cleanText.includes('inovasi')) return `Inovasi Terbaru ${company}`;
    return `Inside Look ${company}`;
  }
  
  return null;
 }

 detectTopicFromContent(text) {
  const cleanText = text.toLowerCase();
  
  // Specific topic patterns with high accuracy
  const topicPatterns = {
    cybersecurity: /cyber.*security|keamanan.*digital|hacker|malware|phishing|data.*breach/i,
    fintech: /fintech|financial.*technology|payment|digital.*banking|e-wallet/i,
    startup: /startup|entrepreneur|venture.*capital|unicorn|funding/i,
    teknologi: /artificial.*intelligence|machine.*learning|blockchain|cloud.*computing/i,
    bisnis: /bisnis|business.*model|revenue|profit|marketing.*strategy/i,
    interview: /wawancara|interview|tanya.*jawab|ngobrol.*dengan/i,
  };
  
  for (const [topic, pattern] of Object.entries(topicPatterns)) {
    if (pattern.test(text)) {
      return topic;
    }
  }
  
  return null;
 }
 
 generateTopicBasedTitle(topic, text) {
  const topicTitles = {
    cybersecurity: [
      "Ancaman Cyber Security Terbesar",
      "Cara Melindungi Data dari Hacker", 
      "Keamanan Digital di Era Modern"
    ],
    fintech: [
      "Revolusi Industri Fintech", 
      "Masa Depan Pembayaran Digital",
      "Inovasi Teknologi Keuangan"
    ],
    startup: [
      "Perjalanan Membangun Startup",
      "Tips Sukses untuk Entrepreneur", 
      "Rahasia Startup Unicorn"
    ],
    interview: [
      "Wawancara Inspiratif Pengusaha",
      "Obrolan Santai dengan Expert",
      "Interview Eksklusif Founder"
    ]
  };
  
  const titles = topicTitles[topic] || ["Pembahasan Menarik Topik Terkini"];
  return titles[Math.floor(Math.random() * titles.length)];
 }
 
 generateContentSummaryTitle(text) {
  // Extract first meaningful phrase
  const sentences = text.split(/[.!?]+/).filter(s => s.trim().length > 20);
  
  if (sentences.length > 0) {
    const firstSentence = sentences[0].trim();
    
    // Extract key topics from first sentence
    const words = firstSentence
      .replace(/[^\w\s]/g, ' ')
      .split(/\s+/)
      .filter(word => word.length > 4)
      .slice(0, 4);
      
    if (words.length >= 2) {
      return `Pembahasan ${words.slice(0, 2).join(' ')}`;
    }
  }
  
  return "Diskusi Menarik dan Inspiratif";
 }
 
 extractTopicKeywords(text) {
  const keywords = [];
  const patterns = [
    /tentang\s+([a-z\s]+)/gi,
    /membahas\s+([a-z\s]+)/gi,
    /soal\s+([a-z\s]+)/gi,
    /mengenai\s+([a-z\s]+)/gi
  ];
  
  patterns.forEach(pattern => {
    const matches = [...text.matchAll(pattern)];
    matches.forEach(match => {
      if (match[1] && match[1].length > 3) {
        keywords.push(match[1].trim());
      }
    });
  });
  
  return [...new Set(keywords)];
 }
  const topicEngagements = {
   travel: {
    triggers: /travel|penerbangan|boarding|singapore|amerika|perjalanan|terbang|pesawat|airlines|business class.*singapore|pengalaman.*naik.*business|kursi.*flat/i,
    titles: ['Rahasia Upgrade Gratis di Pesawat', 'Kesalahan Fatal Saat Traveling', 'Tips Hemat Travel ala Backpacker', 'Pengalaman Mengerikan di Pesawat'],
   },
   bisnis: {
    triggers: /startup.*unicorn|startup.*collapse|bisnis|usaha|investasi|uang|profit|modal|jual|valuasi|red flag|dollar/i,
    titles: ['Cara Cerdas Memulai Bisnis Tanpa Modal', 'Kesalahan Fatal Pengusaha Pemula', 'Rahasia Sukses Bisnis Milenial', 'Strategi Jitu Gandakan Keuntungan'],
   },
   teknologi: {
    triggers: /teknologi|gadget|smartphone|laptop|ai|robot|iphone|android|apple|tech|manufacturing.*process|canggih.*rahasia/i,
    titles: ['Teknologi Masa Depan yang Mengubah Hidup', 'Rahasia Dibalik Gadget Terpopuler', 'Fakta Mengejutkan Tentang AI', 'Teknologi yang Bikin Kita Malas Berpikir'],
   },
   lifestyle: {
    triggers: /lifestyle|hidup|kebiasaan|rutinitas|sehat|diet|olahraga|makanan|sukses.*pagi|bangun.*jam|meditasi/i,
    titles: ['Kebiasaan Orang Sukses Sebelum Tidur', 'Mengapa Diet Selalu Gagal di Hari ke-3', 'Rahasia Hidup Bahagia Tanpa Stres', 'Rutinitas Pagi yang Mengubah Hidup'],
   },
   entertainment: {
    triggers: /film|drama|artis|selebriti|musik|lagu|konser|podcast|wwdc/i,
    titles: ['Plot Twist yang Bikin Penonton Melongo', 'Behind the Scene yang Nggak Disangka', 'Rahasia Sukses Content Creator', 'Momen Viral yang Mengubah Segalanya'],
   },
  };

  // Check for emotional triggers first
  let detectedEmotion = null;
  for (const [emotion, pattern] of Object.entries(emotionPatterns)) {
   if (pattern.test(text)) {
    detectedEmotion = emotion;
    break;
   }
  }

  // Check for topic-specific content with better matching
  let selectedTitle = null;
  let matchedTopic = null;

  for (const [topic, config] of Object.entries(topicEngagements)) {
   if (config.triggers.test(cleanText)) {
    matchedTopic = topic;
    const randomTitle = config.titles[Math.floor(Math.random() * config.titles.length)];
    selectedTitle = randomTitle;
    console.log(`🎯 [Fallback] Detected topic: ${topic}, selected: "${selectedTitle}"`);
    break;
   }
  } // Emotion-based title modification
  if (detectedEmotion && selectedTitle) {
   const emotionPrefixes = {
    shocking: 'Fakta Mengejutkan:',
    sad: 'Kisah Menyentuh:',
    funny: 'Momen Kocak:',
    angry: 'Yang Bikin Kesel:',
    mysterious: 'Rahasia Tersembunyi:',
    inspiring: 'Inspirasi Hidup:',
   };

   if (emotionPrefixes[detectedEmotion]) {
    selectedTitle = `${emotionPrefixes[detectedEmotion]} ${selectedTitle}`;
   }
  }

  // Advanced keyword extraction for unique titles
  if (!selectedTitle) {
   const importantWords = this.extractKeyPhrases(text);
   if (importantWords.length > 0) {
    const engagingPrefixes = ['Ternyata', 'Mengapa', 'Rahasia di Balik', 'Fakta Tersembunyi', 'Yang Tidak Kamu Tahu Tentang', 'Kejutan Besar', 'Misteri'];

    const prefix = engagingPrefixes[Math.floor(Math.random() * engagingPrefixes.length)];
    selectedTitle = `${prefix} ${importantWords[0]}`;
   }
  }

  return selectedTitle || 'Pembahasan Menarik yang Wajib Ditonton';
 }

 generateFallbackDescription(text, duration) {
  const cleanText = text.toLowerCase();

  // Topic-based descriptions
  const topicDescriptions = {
   teknologi: ['Mengungkap teknologi terdepan yang akan mengubah cara kita hidup', 'Review mendalam gadget terbaru dengan analisis pro dan kontra', 'Fakta mengejutkan tentang perkembangan teknologi masa depan'],
   bisnis: ['Strategi bisnis terbukti yang digunakan para entrepreneur sukses', 'Tips investasi cerdas untuk pemula yang ingin kaya secara finansial', 'Rahasia membangun passive income dari nol hingga jutaan rupiah'],
   travel: ['Pengalaman traveling dengan tips hemat dan destinasi tersembunyi', 'Rahasia upgrade gratis dan hack perjalanan yang jarang diketahui', 'Review honest transportasi dan akomodasi dari pengalaman nyata'],
   lifestyle: ['Kebiasaan sederhana yang terbukti mengubah kualitas hidup menjadi lebih baik', 'Tips praktis menjalani hidup sehat tanpa ribet dan mahal', 'Rutinitas harian orang sukses yang bisa ditiru mulai hari ini'],
   entertainment: ['Behind the scene menarik yang jarang terungkap ke publik', 'Analisis mendalam tentang fenomena viral dan dampaknya terhadap society', 'Cerita inspiratif dari dunia entertainment yang mengubah perspektif hidup'],
  };

  // Find matching topic with enhanced detection
  let selectedDescriptions = [];
  let detectedTopic = null;

  for (const [topic, descriptions] of Object.entries(topicDescriptions)) {
   const topicTriggers = {
    travel: /travel|penerbangan|boarding|singapore|amerika|perjalanan|terbang|pesawat|airlines|business class.*singapore|pengalaman.*naik.*business|kursi.*flat/i,
    bisnis: /startup.*unicorn|startup.*collapse|bisnis|usaha|investasi|uang|profit|modal|jual|valuasi|red flag|dollar/i,
    teknologi: /teknologi|gadget|smartphone|laptop|ai|robot|iphone|android|apple|tech|manufacturing.*process|canggih.*rahasia/i,
    lifestyle: /lifestyle|hidup|kebiasaan|rutinitas|sehat|diet|olahraga|makanan|sukses.*pagi|bangun.*jam|meditasi/i,
    entertainment: /film|drama|artis|selebriti|musik|lagu|konser|podcast|wwdc/i,
   };

   if (topicTriggers[topic] && topicTriggers[topic].test(cleanText)) {
    selectedDescriptions = descriptions;
    detectedTopic = topic;
    console.log(`📋 [Description] Topic detected: ${topic}`);
    break;
   }
  }

  // Select random description from matched topic
  if (selectedDescriptions.length > 0) {
   const randomDesc = selectedDescriptions[Math.floor(Math.random() * selectedDescriptions.length)];
   return randomDesc;
  }

  // Content-based fallback descriptions
  const contentKeywords = {
   tutorial: /cara|tutorial|tips|bagaimana|how to|langkah/i,
   review: /review|pengalaman|test|coba|pakai/i,
   story: /cerita|kisah|pengalaman|kejadian/i,
   discussion: /diskusi|bahas|ngobrol|bicara|talk/i,
   news: /berita|update|terbaru|trending|viral/i,
  };

  for (const [type, pattern] of Object.entries(contentKeywords)) {
   if (pattern.test(cleanText)) {
    const typeDescriptions = {
     tutorial: 'Panduan lengkap step by step yang mudah dipahami dan langsung bisa dipraktikkan',
     review: 'Review jujur berdasarkan pengalaman nyata dengan detail kelebihan dan kekurangan',
     story: 'Cerita inspiratif yang memberikan pelajaran berharga untuk kehidupan sehari-hari',
     discussion: 'Diskusi mendalam dengan perspektif menarik yang membuka wawasan baru',
     news: 'Update terbaru dengan analisis komprehensif tentang dampak dan implikasinya',
    };
    return typeDescriptions[type];
   }
  }

  // Extract key topics from text for custom description
  const keyPhrases = this.extractKeyPhrases(text);
  if (keyPhrases.length > 0) {
   return `Pembahasan menarik tentang ${keyPhrases.slice(0, 2).join(' dan ').toLowerCase()} yang memberikan insight berharga`;
  }

  // Default engaging descriptions
  const defaultDescriptions = [
   'Konten berkualitas dengan insight menarik yang wajib ditonton sampai habis',
   'Pembahasan mendalam yang memberikan perspektif baru tentang topik penting',
   'Informasi berharga yang jarang dibahas dan bisa mengubah cara pandang kita',
   'Diskusi engaging dengan takeaway praktis yang bisa langsung diaplikasikan',
  ];

  return defaultDescriptions[Math.floor(Math.random() * defaultDescriptions.length)];
 }
 // Remove common words and extract meaningful phrases
 extractKeyPhrases(text) {
  // Remove common words and extract meaningful phrases
  const commonWords = new Set([
   'yang',
   'dan',
   'atau',
   'tapi',
   'jadi',
   'saya',
   'kita',
   'dia',
   'mereka',
   'ini',
   'itu',
   'untuk',
   'dari',
   'dengan',
   'pada',
   'dalam',
   'ke',
   'di',
   'adalah',
   'akan',
   'sudah',
   'belum',
   'bisa',
   'tidak',
   'nggak',
   'kayak',
   'gimana',
   'kenapa',
   'kapan',
   'dimana',
   'siapa',
   'apa',
   'juga',
   'lagi',
  ]);

  const words = text
   .toLowerCase()
   .replace(/[^\w\s]/g, ' ')
   .split(/\s+/)
   .filter((word) => word.length > 3 && !commonWords.has(word));

  // Find frequent meaningful words
  const wordCount = {};
  words.forEach((word) => {
   wordCount[word] = (wordCount[word] || 0) + 1;
  });

  return Object.entries(wordCount)
   .filter(([word, count]) => count > 1 || word.length > 6)
   .sort((a, b) => b[1] - a[1])
   .slice(0, 3)
   .map(([word]) => word.charAt(0).toUpperCase() + word.slice(1));
 }

 capitalizeTitle(text) {
  return text.replace(/\b\w/g, (l) => l.toUpperCase());
 }

 async respectRateLimit() {
  const now = Date.now();
  const timeSinceLastRequest = now - this.lastRequestTime;

  if (timeSinceLastRequest < this.rateLimitDelay) {
   const waitTime = this.rateLimitDelay - timeSinceLastRequest;
   await new Promise((resolve) => setTimeout(resolve, waitTime));
  }

  this.lastRequestTime = Date.now();
 }
}

export default new AITitleGeneratorService();
