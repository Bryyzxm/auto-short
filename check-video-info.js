// Script untuk mengecek informasi video YouTube
// Using built-in fetch (Node.js 18+)

async function checkVideoInfo() {
  const videoId = 'neA_E50L0F8';
  const videoUrl = `https://www.youtube.com/watch?v=${videoId}`;
  
  console.log(`🔍 Checking video info for: ${videoId}`);
  console.log(`📺 Video URL: ${videoUrl}`);
  
  try {
    // Get basic video page
    console.log('\n=== Fetching YouTube video page ===');
    const response = await fetch(videoUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      }
    });
    
    console.log(`Status: ${response.status}`);
    
    if (response.ok) {
      const html = await response.text();
      
      // Extract basic video info
      const titleMatch = html.match(/<title>([^<]+)<\/title>/);
      const title = titleMatch ? titleMatch[1].replace(' - YouTube', '') : 'Unknown';
      
      // Check for video duration
      const durationMatch = html.match(/"lengthSeconds":"(\d+)"/);
      const duration = durationMatch ? parseInt(durationMatch[1]) : 0;
      
      // Check if video is available
      const isPrivate = html.includes('"isPrivate":true');
      const isUnlisted = html.includes('"isUnlisted":true');
      const isLive = html.includes('"isLiveContent":true');
      const isShort = html.includes('"isShortFormVideoEnabled":true');
      
      // Check for captions availability
      const hasCaptions = html.includes('"captions"') || html.includes('"captionTracks"');
      const hasAutoCaption = html.includes('"kind":"asr"');
      
      console.log('\n📊 Video Information:');
      console.log(`  Title: ${title}`);
      console.log(`  Duration: ${duration} seconds (${Math.floor(duration/60)}:${(duration%60).toString().padStart(2, '0')})`);
      console.log(`  Is Private: ${isPrivate}`);
      console.log(`  Is Unlisted: ${isUnlisted}`);
      console.log(`  Is Live: ${isLive}`);
      console.log(`  Is Short: ${isShort}`);
      console.log(`  Has Captions: ${hasCaptions}`);
      console.log(`  Has Auto Caption: ${hasAutoCaption}`);
      
      // Check for specific patterns that might indicate why transcript is not available
      if (duration < 60) {
        console.log('\n⚠️  Video is very short (< 1 minute) - may not have auto-generated captions');
      }
      
      if (isShort) {
        console.log('\n⚠️  This is a YouTube Short - auto-captions may not be available');
      }
      
      if (isLive) {
        console.log('\n⚠️  This is live content - captions may not be available');
      }
      
      // Try to extract any caption track info from the page
      const captionRegex = /"captionTracks":\[(.*?)\]/;
      const captionMatch = html.match(captionRegex);
      if (captionMatch) {
        console.log('\n📝 Caption tracks found in page:');
        console.log(captionMatch[1]);
      } else {
        console.log('\n❌ No caption tracks found in video page');
      }
      
      // Check for player response
      const playerResponseMatch = html.match(/var ytInitialPlayerResponse = ({.*?});/);
      if (playerResponseMatch) {
        try {
          const playerResponse = JSON.parse(playerResponseMatch[1]);
          const captions = playerResponse?.captions?.playerCaptionsTracklistRenderer?.captionTracks;
          if (captions && captions.length > 0) {
            console.log('\n📝 Caption tracks from player response:');
            captions.forEach((track, i) => {
              console.log(`  Track ${i + 1}: ${track.name?.simpleText || 'Unknown'} (${track.languageCode}) - Kind: ${track.kind || 'manual'}`);
            });
          } else {
            console.log('\n❌ No caption tracks in player response');
          }
        } catch (parseError) {
          console.log('\n⚠️  Could not parse player response');
        }
      }
      
    } else {
      console.log(`❌ Failed to fetch video page: ${response.status}`);
      if (response.status === 404) {
        console.log('   Video may not exist or may be private/deleted');
      }
    }
    
  } catch (error) {
    console.log(`❌ Error checking video: ${error.message}`);
  }
}

checkVideoInfo().catch(console.error);