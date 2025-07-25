import scrapy
import json
import re


class TranscriptSpider(scrapy.Spider):
    name = "transcript"
    
    def __init__(self, video_url=None, *args, **kwargs):
        super(TranscriptSpider, self).__init__(*args, **kwargs)
        if video_url:
            self.start_urls = [video_url]
        else:
            self.start_urls = []
    
    def parse(self, response):
        """
        Main parsing method that extracts the ytInitialPlayerResponse JSON
        and finds the transcript URL.
        """
        # Find the script tag containing ytInitialPlayerResponse
        script_content = response.xpath(
            '//script[contains(text(), "var ytInitialPlayerResponse")]/text()'
        ).get()
        
        if not script_content:
            self.logger.error("Could not find ytInitialPlayerResponse in the page")
            return
        
        try:
            # Extract JSON from the script content
            # Pattern to match: var ytInitialPlayerResponse = {...};
            json_match = re.search(
                r'var ytInitialPlayerResponse\s*=\s*({.*?});',
                script_content,
                re.DOTALL
            )
            
            if not json_match:
                self.logger.error("Could not extract JSON from ytInitialPlayerResponse")
                return
            
            json_str = json_match.group(1)
            player_response = json.loads(json_str)
            
            # Navigate to caption tracks
            captions = player_response.get('captions')
            if not captions:
                self.logger.error("No captions found in player response")
                return
            
            caption_tracks = captions.get('playerCaptionsTracklistRenderer', {}).get('captionTracks')
            if not caption_tracks:
                self.logger.error("No caption tracks found")
                return
            
            # Find a suitable caption track (prefer English, but accept any)
            transcript_url = None
            preferred_languages = ['en', 'en-US', 'id', 'en-GB']
            
            # First, try to find preferred languages
            for track in caption_tracks:
                language_code = track.get('languageCode', '')
                if language_code in preferred_languages:
                    transcript_url = track.get('baseUrl')
                    self.logger.info(f"Found transcript for language: {language_code}")
                    break
            
            # If no preferred language found, use the first available track
            if not transcript_url and caption_tracks:
                transcript_url = caption_tracks[0].get('baseUrl')
                language_code = caption_tracks[0].get('languageCode', 'unknown')
                self.logger.info(f"Using first available transcript language: {language_code}")
            
            if transcript_url:
                # Make request to transcript XML file
                yield scrapy.Request(
                    url=transcript_url,
                    callback=self.parse_transcript,
                    meta={'video_url': response.url}
                )
            else:
                self.logger.error("No valid transcript URL found")
                
        except json.JSONDecodeError as e:
            self.logger.error(f"Failed to parse JSON: {e}")
        except Exception as e:
            self.logger.error(f"Unexpected error while parsing: {e}")
    
    def parse_transcript(self, response):
        """
        Parse the transcript XML file and extract all text content.
        """
        try:
            # Extract all text nodes from the XML
            text_nodes = response.xpath('//text/text()').getall()
            
            if not text_nodes:
                self.logger.error("No text nodes found in transcript XML")
                return
            
            # Join all text content with spaces
            transcript_text = ' '.join(text_nodes)
            
            # Clean up extra whitespace
            transcript_text = re.sub(r'\s+', ' ', transcript_text).strip()
            
            self.logger.info(f"Successfully extracted transcript with {len(transcript_text)} characters")
            
            # Yield the final transcript item
            yield {
                'transcript_text': transcript_text,
                'video_url': response.meta.get('video_url'),
                'character_count': len(transcript_text),
                'word_count': len(transcript_text.split())
            }
            
        except Exception as e:
            self.logger.error(f"Error parsing transcript XML: {e}")
