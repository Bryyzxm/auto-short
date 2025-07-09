// Test script untuk menguji pengambilan transkrip video neA_E50L0F8
// Using built-in fetch (Node.js 18+)

async function testVideoTranscript() {
  const videoId = 'neA_E50L0F8';
  console.log(`🔍 Testing transcript fetch for video: ${videoId}`);
  
  // Test 1: LemnosLife API
  console.log('\n=== Testing LemnosLife API ===');
  try {
    const apiUrl = `https://yt.lemnoslife.com/noKey/transcript?videoId=${videoId}`;
    const response = await fetch(apiUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      },
      timeout: 15000
    });
    
    console.log(`Status: ${response.status}`);
    if (response.ok) {
      const data = await response.json();
      console.log('Response structure:', Object.keys(data));
      if (data?.transcript?.segments) {
        console.log(`✅ LemnosLife found ${data.transcript.segments.length} segments`);
        console.log('First segment:', data.transcript.segments[0]);
      } else {
        console.log('❌ No segments found in LemnosLife response');
        console.log('Full response:', JSON.stringify(data, null, 2));
      }
    } else {
      console.log(`❌ LemnosLife API failed with status ${response.status}`);
    }
  } catch (error) {
    console.log(`❌ LemnosLife API error: ${error.message}`);
  }
  
  // Test 2: TimedText API
  console.log('\n=== Testing TimedText API ===');
  try {
    // First get track list
    const listUrl = `https://video.google.com/timedtext?type=list&v=${videoId}`;
    const listRes = await fetch(listUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      },
      timeout: 10000
    });
    
    console.log(`Track list status: ${listRes.status}`);
    if (listRes.ok) {
      const listXml = await listRes.text();
      console.log('Track list response length:', listXml.length);
      console.log('Track list preview:', listXml.substring(0, 500));
      
      // Parse tracks
      const trackRegex = /<track\s+([^>]+)\/>/g;
      const tracks = [];
      let m;
      while ((m = trackRegex.exec(listXml)) !== null) {
        const attrStr = m[1];
        const attrs = {};
        attrStr.replace(/(\w+)="([^"]*)"/g, (_, k, v) => {
          attrs[k] = v;
        });
        tracks.push(attrs);
      }
      
      console.log(`Found ${tracks.length} tracks:`);
      tracks.forEach((track, i) => {
        console.log(`  Track ${i + 1}:`, track);
      });
      
      // Try to get transcript for Indonesian and English
      const langOrder = ['id', 'en'];
      for (const lang of langOrder) {
        console.log(`\n--- Trying language: ${lang} ---`);
        const captionUrl = `https://video.google.com/timedtext?lang=${lang}&v=${videoId}&kind=asr&fmt=vtt`;
        console.log('URL:', captionUrl);
        
        try {
          const res = await fetch(captionUrl, {
            headers: {
              'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
            },
            timeout: 15000
          });
          
          console.log(`Caption status: ${res.status}`);
          if (res.ok) {
            const bodyText = await res.text();
            console.log('Caption response length:', bodyText.length);
            console.log('Caption preview:', bodyText.substring(0, 500));
            
            if (bodyText.includes('-->')) {
              console.log('✅ Found VTT format transcript!');
              // Parse segments
              const regex = /(\d{2}:\d{2}:\d{2}\.\d{3}) --> (\d{2}:\d{2}:\d{2}\.\d{3})\s+([\s\S]*?)(?=\n\d|$)/g;
              const segments = [];
              let match;
              while ((match = regex.exec(bodyText)) !== null) {
                const text = match[3].replace(/\n/g, ' ').replace(/\s+/g, ' ').trim();
                if (text) segments.push({ start: match[1], end: match[2], text });
              }
              console.log(`Parsed ${segments.length} segments`);
              if (segments.length > 0) {
                console.log('First segment:', segments[0]);
                console.log('Last segment:', segments[segments.length - 1]);
                return; // Success, exit
              }
            }
          }
        } catch (error) {
          console.log(`❌ Caption fetch error: ${error.message}`);
        }
      }
    }
  } catch (error) {
    console.log(`❌ TimedText API error: ${error.message}`);
  }
  
  console.log('\n❌ All methods failed to get transcript');
}

testVideoTranscript().catch(console.error);