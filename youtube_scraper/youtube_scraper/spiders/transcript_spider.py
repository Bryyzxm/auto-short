import scrapy
import json
import re

class TranscriptSpider(scrapy.Spider):
    """
    This spider scrapes YouTube transcripts by making an authenticated request
    using cookies provided via Zyte's custom spider settings.
    """
    name = "transcript"

    def __init__(self, video_url=None, *args, **kwargs):
        super(TranscriptSpider, self).__init__(*args, **kwargs)
        self.video_url = video_url
        if not self.video_url:
            raise ValueError("The 'video_url' argument is required.")

    def start_requests(self):
        """
        This method is called to generate the initial request.
        We override it to read cookies from settings and attach them to the request.
        """
        cookies_str = self.settings.get('YOUTUBE_COOKIES')
        if not cookies_str:
            self.logger.warning("YOUTUBE_COOKIES setting not found. Making an unauthenticated request.")
            cookies_dict = {}
        else:
            # Parse the Netscape cookie string into a dictionary
            cookies_dict = {}
            for line in cookies_str.strip().split('\n'):
                if not line.startswith('#') and line.strip():
                    parts = line.split('\t')
                    if len(parts) == 7:
                        cookies_dict[parts[5]] = parts[6]
        
        # Yield the initial request to the video page with cookies
        yield scrapy.Request(
            url=self.video_url,
            cookies=cookies_dict,
            callback=self.parse
        )

    def parse(self, response):
        """
        Parses the main video page to find the transcript URL.
        """
        self.logger.info("Successfully fetched the main video page.")
        script_tag = response.xpath('//script[contains(., "var ytInitialPlayerResponse = ")]/text()').get()
        
        if not script_tag:
            self.logger.error("Could not find ytInitialPlayerResponse script tag.")
            return

        json_str_match = re.search(r"var ytInitialPlayerResponse = ({.*?});", script_tag)
        if not json_str_match:
            self.logger.error("Could not extract JSON object from script tag.")
            return

        try:
            player_response = json.loads(json_str_match.group(1))
            
            # Navigate through the JSON to find caption tracks
            tracks = player_response.get('captions', {}).get('playerCaptionsTracklistRenderer', {}).get('captionTracks', [])
            
            if not tracks:
                self.logger.error("No caption tracks found in the player response.")
                return

            transcript_url = None
            # Find the English or Indonesian transcript URL
            for track in tracks:
                if track.get('languageCode') in ['en', 'id']:
                    transcript_url = track.get('baseUrl')
                    break
            
            if transcript_url:
                self.logger.info(f"Found transcript URL: {transcript_url}")
                # Request the transcript file
                yield scrapy.Request(url=transcript_url, callback=self.parse_transcript)
            else:
                self.logger.error("Could not find an English or Indonesian transcript URL.")

        except (json.JSONDecodeError, KeyError) as e:
            self.logger.error(f"Failed to parse JSON or find keys: {e}")

    def parse_transcript(self, response):
        """
        Parses the downloaded XML transcript file and extracts the text.
        """
        # The response is XML, so we use xpath to find all <text> nodes
        all_text_nodes = response.xpath('//text/text()').getall()
        
        if not all_text_nodes:
            self.logger.error("Transcript XML file was empty or did not contain <text> nodes.")
            return

        # Join all text pieces into a single string
        full_transcript = " ".join(all_text_nodes)
        
        # Clean up the text (optional, but good practice)
        full_transcript = full_transcript.replace('\n', ' ').strip()
        
        self.logger.info(f"Successfully scraped transcript ({len(full_transcript)} characters).")
        
        # Yield the final result
        yield {
            'transcript_text': full_transcript
        }