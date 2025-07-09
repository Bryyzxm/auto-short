// Using built-in fetch (Node.js 18+)

async function debugCaptionUrls(videoId) {
  console.log(`🔍 Debugging caption URLs for video: ${videoId}`);
  
  try {
    const videoUrl = `https://www.youtube.com/watch?v=${videoId}`;
    console.log(`📡 Fetching: ${videoUrl}`);
    
    const response = await fetch(videoUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      },
      timeout: 15000
    });
    
    if (response.ok) {
      const html = await response.text();
      const playerResponseMatch = html.match(/var ytInitialPlayerResponse = ({.*?});/);
      
      if (playerResponseMatch) {
        const playerResponse = JSON.parse(playerResponseMatch[1]);
        const captions = playerResponse?.captions?.playerCaptionsTracklistRenderer?.captionTracks;
        
        if (captions && captions.length > 0) {
          console.log(`✅ Found ${captions.length} caption tracks:`);
          
          captions.forEach((track, index) => {
            console.log(`\n📝 Track ${index + 1}:`);
            console.log(`  - Language Code: ${track.languageCode}`);
            console.log(`  - Name: ${track.name?.simpleText || 'N/A'}`);
            console.log(`  - Kind: ${track.kind || 'manual'}`);
            console.log(`  - Base URL: ${track.baseUrl}`);
            
            // Test different URL variations
            const urlVariations = [
              track.baseUrl + '&fmt=vtt',
              track.baseUrl + '&fmt=srv3', 
              track.baseUrl,
              track.baseUrl + '&fmt=ttml'
            ];
            
            console.log(`  - URL Variations:`);
            urlVariations.forEach((url, i) => {
              console.log(`    ${i + 1}. ${url}`);
            });
          });
          
          // Test the first Indonesian track
          const idTrack = captions.find(c => c.languageCode === 'id' || c.languageCode?.startsWith('id'));
          if (idTrack) {
            console.log(`\n🧪 Testing Indonesian track:`);
            const testUrls = [
              idTrack.baseUrl + '&fmt=vtt',
              idTrack.baseUrl + '&fmt=srv3',
              idTrack.baseUrl,
              idTrack.baseUrl + '&fmt=ttml'
            ];
            
            for (let i = 0; i < testUrls.length; i++) {
              try {
                console.log(`\n🔗 Testing URL ${i + 1}: ${testUrls[i].substring(0, 100)}...`);
                const testResponse = await fetch(testUrls[i], {
                  headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
                  },
                  timeout: 10000
                });
                
                console.log(`📊 Status: ${testResponse.status}`);
                console.log(`📊 Headers:`, Object.fromEntries(testResponse.headers));
                
                if (testResponse.ok) {
                  const text = await testResponse.text();
                  console.log(`📝 Response length: ${text.length}`);
                  if (text.length > 0) {
                    console.log(`📄 First 200 chars: ${text.substring(0, 200)}`);
                    if (text.includes('-->') || text.includes('<text')) {
                      console.log(`✅ Valid caption format detected!`);
                      break;
                    }
                  }
                } else {
                  console.log(`❌ Request failed`);
                }
              } catch (error) {
                console.log(`❌ Error testing URL ${i + 1}: ${error.message}`);
              }
            }
          }
        } else {
          console.log(`❌ No caption tracks found`);
        }
      } else {
        console.log(`❌ No player response found in HTML`);
      }
    } else {
      console.log(`❌ Failed to fetch video page: ${response.status}`);
    }
  } catch (error) {
    console.error(`❌ Debug failed:`, error.message);
  }
}

// Test with the problematic video
debugCaptionUrls('neA_E50L0F8');