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
   console.warn('[AI-TITLE] No GROQ API key, using enhanced fallback titles');
   return this.generateFallbackTitles(segments);
  }

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
  const segmentTexts = segments
   .map((seg, index) => {
    // Get more context (up to 1000 chars) for better title generation
    const fullText = seg.text.substring(0, 1000);
    return `=== SEGMENT ${index + 1} (Durasi: ${seg.duration}s) ===\nTRANSKRIP LENGKAP:\n${fullText}\n`;
   })
   .join('\n');

  const prompt = `Kamu adalah AI content analyst terbaik yang HARUS menghasilkan judul 100% AKURAT berdasarkan isi transkrip. 

KONTEKS VIDEO: ${videoContext || 'Video podcast/diskusi'}

${segmentTexts}

=== INSTRUKSI UTAMA ===
STEP 1: BACA dan ANALISIS setiap transkrip dengan SANGAT TELITI
STEP 2: IDENTIFIKASI elemen utama:
   - Nama orang (CEO, founder, tokoh)
   - Nama perusahaan/organisasi 
   - Topik spesifik yang dibahas
   - Konteks pembicaraan

STEP 3: BUAT judul yang TEPAT berdasarkan analisis

=== ATURAN KETAT ===
✅ WAJIB: Judul HARUS relevan 100% dengan isi transkrip
✅ FOKUS: Gunakan nama orang/perusahaan yang disebutkan
✅ TOPIK: Sebutkan topik spesifik yang benar-benar dibahas
✅ PANJANG: Maksimal 8 kata dalam Bahasa Indonesia
❌ DILARANG: Template generic/clickbait yang tidak sesuai isi
❌ DILARANG: Judul random seperti "Tips Travel" jika tidak membahas travel

=== CONTOH ANALISIS YANG BENAR ===
Transkrip: "Niki Luhur CEO Fida perusahaan cyber security..."
✅ BENAR: "CEO Fida Niki Bahas Cyber Security"
❌ SALAH: "Tips Hemat Travel Backpacker"

Transkrip: "strategi ekspansi ke Thailand, Malaysia..."
✅ BENAR: "Strategi Ekspansi Internasional ke Asia"
❌ SALAH: "Inside dia itu"

=== TEMPLATE JUDUL (gunakan yang sesuai konten) ===
- Jika ada CEO + perusahaan: "[Nama CEO] [Perusahaan] Ungkap [Topik]"
- Jika ada founder: "Founder [Perusahaan] Bahas [Topik]" 
- Jika wawancara: "Wawancara Eksklusif [Nama] tentang [Topik]"
- Jika strategi bisnis: "Strategi [Tokoh/Perusahaan] untuk [Topik]"
- Jika tips/cara: "Cara [Tokoh] Mengatasi [Masalah]"

=== OUTPUT FORMAT ===
Hanya JSON dengan format ini:
{
  "titles": [
    {
      "title": "Judul yang SANGAT RELEVAN dengan transkrip",
      "description": "Deskripsi 15-25 kata yang menjelaskan isi segmen secara AKURAT dan SPESIFIK"
    }
  ]
}

CRITICAL: Setiap judul HARUS 100% akurat dengan isi transkrip. Tidak boleh ada judul yang menyesatkan atau tidak relevan.

RESPONSE (JSON saja):`;

  const response = await this.groq.chat.completions.create({
   messages: [{role: 'user', content: prompt}],
   model: 'llama-3.1-8b-instant', // Active model
   temperature: 0.1, // Very low for maximum accuracy and consistency
   max_tokens: 3000, // Increased for detailed analysis
   top_p: 0.9, // Focus on high-probability tokens
   response_format: {type: 'json_object'},
  });

  return response.choices[0]?.message?.content;
 }

 processTitlesResponse(responseText, segments) {
  try {
   const titlesData = JSON.parse(responseText);

   if (!titlesData.titles || !Array.isArray(titlesData.titles)) {
    console.warn('[AI-TITLE] Invalid response format, using enhanced fallback');
    return this.generateFallbackTitles(segments);
   }

   // Map AI-generated titles to segments with validation
   const results = segments.map((segment, index) => {
    const titleData = titlesData.titles[index];

    if (titleData && titleData.title) {
     // VALIDATION: Check title relevance
     const isRelevant = this.validateTitleRelevance(titleData.title, segment.text);

     if (isRelevant) {
      console.log(`✅ [AI-TITLE] Valid title ${index + 1}: "${titleData.title}"`);
      return {
       ...segment,
       title: titleData.title,
       description: titleData.description || this.generateFallbackDescription(segment.text, segment.duration),
      };
     } else {
      console.warn(`⚠️ [AI-TITLE] Invalid title detected: "${titleData.title}" for content: "${segment.text.substring(0, 100)}..."`);
      console.log(`🔄 [AI-TITLE] Using enhanced fallback for segment ${index + 1}`);

      return {
       ...segment,
       title: this.generateFallbackTitle(segment.text),
       description: this.generateFallbackDescription(segment.text, segment.duration),
      };
     }
    }

    // Fallback for missing titles
    console.log(`🔄 [AI-TITLE] No title provided for segment ${index + 1}, using fallback`);
    return {
     ...segment,
     title: this.generateFallbackTitle(segment.text),
     description: this.generateFallbackDescription(segment.text, segment.duration),
    };
   });

   return results;
  } catch (error) {
   console.error('[AI-TITLE] Failed to parse AI response:', error);
   console.log('🔄 [AI-TITLE] Using enhanced fallback system');
   return this.generateFallbackTitles(segments);
  }
 }

 validateTitleRelevance(title, content) {
  const titleLower = title.toLowerCase();
  const contentLower = content.toLowerCase();

  // Extract key entities from title
  const titleWords = titleLower.split(/\s+/).filter((word) => word.length > 3);

  // Check if title contains generic/irrelevant patterns
  const genericPatterns = [
   /^(tips|cara)\s+(hemat|murah)/i,
   /travel.*backpacker/i,
   /inside\s+(dia|itu|saja)/i,
   /pembahasan\s+\w{1,3}$/i, // "Pembahasan xx" dengan kata pendek
   /^(segment|part)\s+\d+$/i,
  ];

  for (const pattern of genericPatterns) {
   if (pattern.test(title)) {
    console.log(`❌ [Validation] Generic pattern detected: ${pattern}`);
    return false;
   }
  }

  // Check if title words appear in content (minimum relevance)
  let relevantWords = 0;
  titleWords.forEach((word) => {
   if (word.length > 4 && contentLower.includes(word)) {
    relevantWords++;
   }
  });

  const relevanceScore = relevantWords / Math.max(titleWords.length, 1);
  console.log(`🔍 [Validation] Title relevance score: ${relevanceScore.toFixed(2)} (${relevantWords}/${titleWords.length} words match)`);

  // Require at least 30% word match for relevance
  return relevanceScore >= 0.3;
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
   const entityTitle = this.generateEntityBasedTitle(entities, text);
   if (entityTitle) {
    console.log(`✅ [Fallback] Generated entity-based title: "${entityTitle}"`);
    return entityTitle;
   }
  }

  // STEP 3: Topic-based title generation with ACCURATE detection
  const detectedTopic = this.detectTopicFromContent(text);
  console.log(`🎯 [Fallback] Detected topic: ${detectedTopic}`);

  if (detectedTopic) {
   const topicTitle = this.generateTopicBasedTitle(detectedTopic, text);
   console.log(`✅ [Fallback] Generated topic-based title: "${topicTitle}"`);
   return topicTitle;
  }

  // STEP 4: Fallback to content summary
  const summaryTitle = this.generateContentSummaryTitle(text);
  console.log(`✅ [Fallback] Generated summary title: "${summaryTitle}"`);
  return summaryTitle;
 }

 extractEntitiesFromText(text) {
  console.log(`🔍 [Entity Extraction] Processing: "${text.substring(0, 100)}..."`);

  const cleanText = text.toLowerCase();

  // Enhanced people extraction patterns
  const peoplePatterns = [
   // Indonesian honorifics
   /(?:pak|bu|bapak|ibu|mas|mbak|bang|kang|ustadz|dr\.?)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)/gi,
   // Professional titles
   /([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)[,\s].*(?:founder|ceo|direktur|ketua|presiden|cto|cmo|cfo)/gi,
   // Self introduction patterns
   /(?:saya|aku|nama\s+saya|perkenalkan)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)/gi,
   // Quoted names
   /"([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)"/gi,
   // Introduction patterns
   /(?:bersama|dengan|ngobrol.*dengan)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)/gi,
   // Interview context
   /(?:wawancara.*dengan|interview.*with)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)/gi,
  ];

  // Enhanced company extraction patterns
  const companyPatterns = [
   // Indonesian business entities
   /(?:pt\.?\s+|cv\.?\s+|perusahaan\s+)([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)/gi,
   // Context-based company detection
   /(?:dari|di)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)[,\s].*(?:perusahaan|startup|company|corp|tech)/gi,
   // Company suffixes
   /([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)(?:\s+(?:inc|corp|ltd|group|teknologi|digital|solutions|fintech|tech))/gi,
   // Specific industry patterns
   /startup\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)/gi,
   // Indonesian company context
   /perusahaan\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)/gi,
   // Brand/platform mentions
   /platform\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)/gi,
  ];

  const people = [];
  const companies = [];

  // Extract people names
  peoplePatterns.forEach((pattern) => {
   const matches = [...text.matchAll(pattern)];
   matches.forEach((match) => {
    if (match[1] && match[1].length > 2 && match[1].length < 30) {
     const name = match[1].trim();
     // Filter out common non-names
     if (!['Yang', 'Ini', 'Itu', 'Dan', 'Atau', 'Jadi', 'Tapi', 'Kalau', 'Untuk'].includes(name)) {
      people.push(name);
     }
    }
   });
  });

  // Extract company names
  companyPatterns.forEach((pattern) => {
   const matches = [...text.matchAll(pattern)];
   matches.forEach((match) => {
    if (match[1] && match[1].length > 2 && match[1].length < 30) {
     const company = match[1].trim();
     // Filter out common non-company words and pronouns
     const nonCompanyWords = [
      'Yang',
      'Ini',
      'Itu',
      'Dan',
      'Atau',
      'Jadi',
      'Tapi',
      'Digital',
      'Technology',
      'dia itu',
      'kita itu',
      'gue itu',
      'lu itu',
      'kayak gitu',
      'gitu loh',
      'sama itu',
      'terus itu',
      'udah itu',
      'kan itu',
      'aja itu',
      'Dia Itu',
      'Kita Itu',
      'Gue Itu',
      'Lu Itu',
     ];

     const isNonCompany = nonCompanyWords.some((word) => company.toLowerCase() === word.toLowerCase() || company.toLowerCase().includes('itu') || company.toLowerCase().includes('gitu') || company.length < 3);

     if (!isNonCompany) {
      companies.push(company);
     }
    }
   });
  }); // Extract key topics and keywords
  const topics = this.extractTopicKeywords(text);

  const result = {
   people: [...new Set(people)].slice(0, 3), // Top 3 people
   companies: [...new Set(companies)].slice(0, 3), // Top 3 companies
   topics,
  };

  console.log(`📊 [Entity Extraction] Found:`, result);
  return result;
 }

 generateEntityBasedTitle(entities, text) {
  const cleanText = text.toLowerCase();
  console.log(`🎯 [Entity Title] Generating from:`, entities);

  // PRIORITY 1: People + Companies combination (most specific)
  if (entities.people.length > 0 && entities.companies.length > 0) {
   const person = entities.people[0];
   const company = entities.companies[0];

   // Context-aware title generation
   if (cleanText.includes('founder') && cleanText.includes('ceo')) {
    return `${person} Founder CEO ${company}`;
   }
   if (cleanText.includes('ceo') || cleanText.includes('direktur')) {
    return `CEO ${company} ${person} Ungkap Strategi`;
   }
   if (cleanText.includes('cyber') && cleanText.includes('security')) {
    return `${person} ${company} Bahas Cyber Security`;
   }
   if (cleanText.includes('digital') && cleanText.includes('identity')) {
    return `${company} Digital Identity oleh ${person}`;
   }
   if (cleanText.includes('fintech') || cleanText.includes('financial')) {
    return `Founder ${company} ${person} Soal Fintech`;
   }
   if (cleanText.includes('startup') || cleanText.includes('membangun')) {
    return `Journey ${person} Membangun ${company}`;
   }
   if (cleanText.includes('teknologi') || cleanText.includes('inovasi')) {
    return `Inovasi ${company} Bersama ${person}`;
   }
   if (cleanText.includes('wawancara') || cleanText.includes('interview')) {
    return `Wawancara Eksklusif ${person} dari ${company}`;
   }

   // General company-person title
   return `${person} dari ${company} Berbagi Insight`;
  }

  // PRIORITY 2: People only (personal stories, experiences)
  if (entities.people.length > 0) {
   const person = entities.people[0];

   if (cleanText.includes('pengalaman') || cleanText.includes('journey')) {
    return `Pengalaman Menarik ${person}`;
   }
   if (cleanText.includes('cerita') || cleanText.includes('kisah')) {
    return `Kisah Inspiratif ${person}`;
   }
   if (cleanText.includes('tips') || cleanText.includes('advice')) {
    return `Tips Sukses dari ${person}`;
   }
   if (cleanText.includes('strategi') || cleanText.includes('strategy')) {
    return `Strategi ${person} dalam Bisnis`;
   }
   if (cleanText.includes('rahasia') || cleanText.includes('secret')) {
    return `Rahasia Sukses ${person}`;
   }
   if (cleanText.includes('wawancara') || cleanText.includes('interview')) {
    return `Wawancara Eksklusif dengan ${person}`;
   }
   if (cleanText.includes('founder') || cleanText.includes('entrepreneur')) {
    return `Journey Entrepreneur ${person}`;
   }

   return `Insight dari ${person}`;
  }

  // PRIORITY 3: Companies only (business focus)
  if (entities.companies.length > 0) {
   const company = entities.companies[0];

   if (cleanText.includes('startup') || cleanText.includes('membangun')) {
    return `Perjalanan Startup ${company}`;
   }
   if (cleanText.includes('strategi') || cleanText.includes('business')) {
    return `Strategi Bisnis ${company}`;
   }
   if (cleanText.includes('inovasi') || cleanText.includes('innovation')) {
    return `Inovasi Terbaru ${company}`;
   }
   if (cleanText.includes('teknologi') || cleanText.includes('digital')) {
    return `Teknologi ${company}`;
   }
   if (cleanText.includes('produk') || cleanText.includes('product')) {
    return `Produk Unggulan ${company}`;
   }
   if (cleanText.includes('layanan') || cleanText.includes('service')) {
    return `Layanan ${company}`;
   }
   if (cleanText.includes('masa depan') || cleanText.includes('future')) {
    return `Visi Masa Depan ${company}`;
   }

   return `Inside Look ${company}`;
  }

  console.log(`⚠️ [Entity Title] No entities found, returning null`);
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
   cybersecurity: ['Ancaman Cyber Security Terbesar', 'Cara Melindungi Data dari Hacker', 'Keamanan Digital di Era Modern'],
   fintech: ['Revolusi Industri Fintech', 'Masa Depan Pembayaran Digital', 'Inovasi Teknologi Keuangan'],
   startup: ['Perjalanan Membangun Startup', 'Tips Sukses untuk Entrepreneur', 'Rahasia Startup Unicorn'],
   interview: ['Wawancara Inspiratif Pengusaha', 'Obrolan Santai dengan Expert', 'Interview Eksklusif Founder'],
  };

  const titles = topicTitles[topic] || ['Pembahasan Menarik Topik Terkini'];
  return titles[Math.floor(Math.random() * titles.length)];
 }

 generateContentSummaryTitle(text) {
  console.log(`🔍 [Content Summary] Analyzing: "${text.substring(0, 150)}..."`);

  const cleanText = text.toLowerCase();

  // PRIORITY 1: Extract key business entities and topics
  const keywordPatterns = {
   // Business & Expansion
   'Strategi Ekspansi Internasional': /expand.*luar.*negeri|ekspansi.*internasional|buka.*thailand|malaysia|singapore/i,
   'Strategi Bisnis': /strategi.*(bisnis|business)|business.*model|revenue.*model|profit/i,
   'Partnership Strategy': /cari.*partner|local.*partner|bentuk.*ekosistem|bikin.*tim/i,
   'Cash Flow Management': /cash.*flow|jual.*rugi|modal|pendanaan|financial/i,

   // Entrepreneurship & Growth
   'Kisah Entrepreneur': /entrepreneur|founder.*story|membangun.*bisnis|startup.*journey/i,
   'Perjalanan Membangun Bisnis': /membangun.*perusahaan|journey.*startup|dari.*nol/i,
   'Tim dan Manajemen': /andrew.*masuk|hotman.*masuk|berangkatin.*tim|bikin.*tim/i,
   'Decision Making': /kenapa.*mau.*accept|keputusan.*bisnis|strategic.*decision/i,

   // Technology & Innovation
   'Inovasi Digital': /digital.*innovation|teknologi.*baru|disruptive|blockchain/i,
   'Keamanan Cyber': /cyber.*security|security.*digital|hacker|malware|phishing/i,
   'Transformasi Digital': /digital.*transformation|digitalisasi|platform.*digital/i,
   'Fintech Revolution': /fintech|financial.*tech|payment.*digital|e-wallet/i,
   'Data Analytics': /data.*analytics|big.*data|machine.*learning|artificial.*intelligence/i,

   // Investment & Finance
   'Investasi Cerdas': /investasi|investment|funding|venture.*capital|modal/i,
   'Strategi Keuangan': /financial.*strategy|manajemen.*keuangan|cash.*management/i,

   // Leadership & Management
   'Kepemimpinan Modern': /leadership|pemimpin|ceo.*story|direktur|manajemen/i,
   'Visi Masa Depan': /visi.*masa.*depan|future.*vision|prediksi.*trend/i,
   'Manajemen Tim': /team.*management|membangun.*tim|organizational/i,

   // Industry Insights
   'Tren Industri': /trend.*industri|market.*insight|industry.*analysis/i,
   'Kompetisi Pasar': /competition|competitive.*advantage|market.*share/i,
   'Customer Experience': /customer.*experience|user.*experience|pelanggan/i,
  };

  // Check for keyword patterns
  for (const [title, pattern] of Object.entries(keywordPatterns)) {
   if (pattern.test(cleanText)) {
    console.log(`✅ [Content Summary] Matched pattern: "${title}"`);
    return title;
   }
  }

  // PRIORITY 2: Extract meaningful phrases from text
  const sentences = text.split(/[.!?,]+/).filter((s) => s.trim().length > 30);

  if (sentences.length > 0) {
   const firstSentence = sentences[0].trim();

   // Look for meaningful phrases with context
   const meaningfulPhrases = firstSentence.match(/(?:membahas|tentang|soal|mengenai)\s+([^,]{10,40})/i);
   if (meaningfulPhrases && meaningfulPhrases[1]) {
    const topic = meaningfulPhrases[1].trim();
    console.log(`✅ [Content Summary] Found topic: "${topic}"`);
    return `Pembahasan ${topic}`;
   }

   // Extract subject-verb-object patterns
   const actionPhrases = firstSentence.match(/([A-Za-z\s]{5,25})\s+(mengungkap|menjelaskan|membahas|berbagi|menceritakan)\s+([^,]{10,40})/i);
   if (actionPhrases && actionPhrases[3]) {
    const topic = actionPhrases[3].trim();
    console.log(`✅ [Content Summary] Found action topic: "${topic}"`);
    return `${actionPhrases[1].trim()} ${actionPhrases[2]} ${topic}`;
   }
  }

  // PRIORITY 3: Smart fallback with content hints
  if (cleanText.includes('wawancara') || cleanText.includes('interview')) {
   return 'Wawancara Eksklusif';
  }
  if (cleanText.includes('tips') || cleanText.includes('cara')) {
   return 'Tips dan Strategi';
  }
  if (cleanText.includes('rahasia') || cleanText.includes('secret')) {
   return 'Rahasia Sukses';
  }
  if (cleanText.includes('pengalaman') || cleanText.includes('journey')) {
   return 'Pengalaman Berharga';
  }

  console.log(`⚠️ [Content Summary] Using generic fallback`);
  return 'Diskusi Mendalam';
 }

 extractTopicKeywords(text) {
  const keywords = [];
  const patterns = [/tentang\s+([a-z\s]+)/gi, /membahas\s+([a-z\s]+)/gi, /soal\s+([a-z\s]+)/gi, /mengenai\s+([a-z\s]+)/gi];

  patterns.forEach((pattern) => {
   const matches = [...text.matchAll(pattern)];
   matches.forEach((match) => {
    if (match[1] && match[1].length > 3) {
     keywords.push(match[1].trim());
    }
   });
  });

  return [...new Set(keywords)];
 }

 generateFallbackDescription(text, duration) {
  const cleanText = text.toLowerCase();

  // Content-based descriptions
  if (cleanText.includes('ceo') || cleanText.includes('founder')) {
   return 'Wawancara eksklusif dengan pemimpin perusahaan tentang strategi dan visi masa depan';
  }

  if (cleanText.includes('cyber') || cleanText.includes('security')) {
   return 'Pembahasan mendalam tentang keamanan digital dan cara melindungi data pribadi';
  }

  if (cleanText.includes('startup') || cleanText.includes('bisnis')) {
   return 'Tips dan strategi membangun bisnis dari nol hingga sukses besar';
  }

  if (cleanText.includes('teknologi') || cleanText.includes('digital')) {
   return 'Eksplorasi teknologi terbaru dan dampaknya terhadap kehidupan sehari-hari';
  }

  // Default engaging description
  return 'Diskusi menarik dengan insight berharga yang wajib disimak sampai habis';
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
