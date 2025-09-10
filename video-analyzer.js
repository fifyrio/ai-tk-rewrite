#!/usr/bin/env node

require('dotenv').config({ path: '.env.local' });

const { Supadata } = require('@supadata/js');

class VideoAnalyzer {
  constructor(config) {
    this.supadataApiKey = config.supadataApiKey;
    
    // Initialize Supadata client
    if (this.supadataApiKey) {
      this.supadata = new Supadata({
        apiKey: this.supadataApiKey,
      });
    }
  }


  async transcribeFromUrl(url, lang = 'en', textOnly = true, mode = 'auto') {
    try {
      if (!this.supadata) {
        throw new Error('Supadata API key not configured');
      }
      
      console.log('正在从URL获取转录...');
      console.log('URL:', url);
      
      const transcriptResult = await this.supadata.transcript({
        url: url,
        lang: lang,
        text: textOnly,
        mode: mode,
      });

      return transcriptResult.text || transcriptResult;
    } catch (error) {
      throw new Error(`URL转录失败: ${error.message}`);
    }
  }

}

async function main() {
  const config = {
    supadataApiKey: process.env.SUPADATA_API_KEY,
  };

  const testMode = process.argv.includes('--test') || !config.supadataApiKey;
  
  // Filter out --test flag from arguments
  const args = process.argv.filter(arg => arg !== '--test');
  
  // Get URL from arguments
  const url = args[2];
  
  if (!url) {
    console.error('Error: URL is required');
    console.log('Usage: node video-analyzer.js <URL>');
    console.log('Example: node video-analyzer.js https://www.youtube.com/watch?v=dQw4w9WgXcQ');
    console.log('Supported platforms: YouTube, TikTok, Instagram, X (Twitter)');
    process.exit(1);
  }

  if (!url.startsWith('http://') && !url.startsWith('https://')) {
    console.error('Error: Invalid URL format. URL must start with http:// or https://');
    process.exit(1);
  }

  if (!config.supadataApiKey) {
    console.error('Error: SUPADATA_API_KEY environment variable is required');
    process.exit(1);
  }

  if (testMode) {
    console.log('=== TEST MODE ===');
    console.log('URL detected:', url);
    console.log('Supadata API key:', config.supadataApiKey ? 'Set' : 'Not set');
    console.log('\nTest completed successfully! Set SUPADATA_API_KEY to run full analysis.');
    return;
  }

  try {
    const analyzer = new VideoAnalyzer(config);
    
    console.log('Starting URL transcript analysis...');
    console.log('URL:', url);
    
    const audioText = await analyzer.transcribeFromUrl(url);
    
    const result = {
      audioText,
      timestamp: new Date().toISOString(),
      source: 'url',
      url: url
    };
    
    console.log('\n=== ANALYSIS RESULTS ===');
    console.log('\n📝 Audio Transcription:');
    console.log(result.audioText);
    
    // Create transcripts directory if it doesn't exist
    const fs = require('fs');
    const path = require('path');
    const transcriptsDir = path.join(__dirname, 'transcripts');
    if (!fs.existsSync(transcriptsDir)) {
      fs.mkdirSync(transcriptsDir, { recursive: true });
    }
    
    const timestamp = Date.now();
    const outputFile = path.join(transcriptsDir, `transcript_${timestamp}.json`);
    const textFile = path.join(transcriptsDir, `transcript_${timestamp}.txt`);
    
    // Save JSON file with all metadata
    fs.writeFileSync(outputFile, JSON.stringify(result, null, 2));
    
    // Save plain text file with just the transcript
    fs.writeFileSync(textFile, result.audioText);
    
    console.log(`\n📄 Results saved to: ${outputFile}`);
    console.log(`📝 Text transcript saved to: ${textFile}`);

  } catch (error) {
    console.error('Failed to process URL:', error.message);
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}

module.exports = VideoAnalyzer;