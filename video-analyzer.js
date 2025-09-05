#!/usr/bin/env node

require('dotenv').config({ path: '.env.local' });

const fs = require('fs');
const path = require('path');
const axios = require('axios');
const FormData = require('form-data');
const OpenAI = require('openai');
const sharp = require('sharp');
const ffmpeg = require('fluent-ffmpeg');

class VideoAnalyzer {
  constructor(config) {
    this.openaiApiKey = config.openaiApiKey;
    this.openrouterApiKey = config.openrouterApiKey;
    this.useProxy = config.useProxy;
    this.httpProxy = config.httpProxy;
    
    const openaiConfig = {
      apiKey: this.openaiApiKey,
      timeout: 60000 // 60 seconds timeout
    };
    
    // Add proxy configuration if enabled
    if (config.useProxy && config.httpProxy) {
      const { HttpsProxyAgent } = require('https-proxy-agent');
      openaiConfig.httpAgent = new HttpsProxyAgent(config.httpProxy);
      console.log('Using proxy for OpenAI:', config.httpProxy);
    }
    
    this.openai = new OpenAI(openaiConfig);
  }

  async extractFirstFrame(videoPath, outputPath) {
    return new Promise((resolve, reject) => {
      ffmpeg(videoPath)
        .screenshots({
          count: 1,
          folder: path.dirname(outputPath),
          filename: path.basename(outputPath),
          size: '1080x1920'
        })
        .on('end', () => resolve(outputPath))
        .on('error', reject);
    });
  }

  async transcribeAudio(audioPath) {
    try {
      console.log('Transcribing audio with Whisper API...');
      
      const transcription = await this.openai.audio.transcriptions.create({
        file: fs.createReadStream(audioPath),
        model: 'whisper-1',
      });

      return transcription.text;
    } catch (error) {
      throw new Error(`Whisper transcription failed: ${error.message}`);
    }
  }

  async analyzeImageWithVision(imagePath) {
    try {
      console.log('Analyzing image with GPT-4o-mini...');
      
      const imageBuffer = fs.readFileSync(imagePath);
      const base64Image = imageBuffer.toString('base64');
      
      const response = await this.openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'text',
                text: 'Reverse engineer this image. I want you to write a prompt that will recreate this as a new image.'
              },
              {
                type: 'image_url',
                image_url: {
                  url: `data:image/jpeg;base64,${base64Image}`
                }
              }
            ]
          }
        ]
      });

      return response.choices[0].message.content;
    } catch (error) {
      throw new Error(`Image analysis failed: ${error.message}`);
    }
  }

  async suggestSimilarContent(audioText, imagePrompt) {
    try {
      console.log('Generating content suggestions with Perplexity...');
      
      const prompt = `Based on this video script: "${audioText}" and image description: "${imagePrompt}", suggest a content idea different from this video script. It should be in the same niche and on the exact same topic or content idea but offer fresh value. You must pick one idea from your research that matches the topic idea of the video script exactly but is also different and unique from it so it would stand out on social media. Make sure it appeals to a broad audience.`;

      const axiosConfig = {
        headers: {
          'Authorization': `Bearer ${this.openrouterApiKey}`,
          'Content-Type': 'application/json'
        },
        timeout: 60000 // 60 seconds timeout
      };
      
      // Add proxy configuration for axios if enabled
      if (this.useProxy && this.httpProxy) {
        const { HttpsProxyAgent } = require('https-proxy-agent');
        axiosConfig.httpsAgent = new HttpsProxyAgent(this.httpProxy);
        console.log('Using proxy for OpenRouter:', this.httpProxy);
      }

      const response = await axios.post(
        'https://openrouter.ai/api/v1/chat/completions',
        {
          model: 'perplexity/llama-3.1-sonar-small-128k-online',
          messages: [
            {
              role: 'user',
              content: prompt
            }
          ]
        },
        axiosConfig
      );

      return response.data.choices[0].message.content;
    } catch (error) {
      throw new Error(`Content suggestion failed: ${error.message}`);
    }
  }

  async extractAudioFromVideo(videoPath, outputPath) {
    return new Promise((resolve, reject) => {
      ffmpeg(videoPath)
        .output(outputPath)
        .audioCodec('mp3')
        .on('end', () => resolve(outputPath))
        .on('error', reject);
    });
  }

  async processVideo(videoPath, audioPath = null) {
    try {
      const tempFramePath = path.join(__dirname, 'temp_frame.jpg');
      let actualAudioPath = audioPath;
      
      if (!actualAudioPath) {
        console.log('No audio path provided, extracting audio from video...');
        actualAudioPath = path.join(__dirname, 'temp_audio.mp3');
        await this.extractAudioFromVideo(videoPath, actualAudioPath);
        console.log('✓ Audio extracted from video');
      }
      
      console.log('Starting video analysis...');
      console.log('Video path:', videoPath);
      console.log('Audio path:', actualAudioPath);

      await this.extractFirstFrame(videoPath, tempFramePath);
      console.log('✓ First frame extracted');

      const [audioText, imagePrompt] = await Promise.all([
        this.transcribeAudio(actualAudioPath),
        this.analyzeImageWithVision(tempFramePath)
      ]);

      console.log('✓ Audio transcribed');
      console.log('✓ Image analyzed');

      const contentSuggestion = await this.suggestSimilarContent(audioText, imagePrompt);
      console.log('✓ Content suggestion generated');

      fs.unlinkSync(tempFramePath);
      if (!audioPath && fs.existsSync(actualAudioPath)) {
        fs.unlinkSync(actualAudioPath);
      }

      return {
        audioText,
        imagePrompt,
        contentSuggestion,
        timestamp: new Date().toISOString()
      };

    } catch (error) {
      console.error('Error processing video:', error.message);
      throw error;
    }
  }
}

function scanResourcesDirectory() {
  const resourcesDir = path.join(__dirname, 'resources');
  
  if (!fs.existsSync(resourcesDir)) {
    return { videoFiles: [], audioFiles: [] };
  }

  const files = fs.readdirSync(resourcesDir);
  const videoFiles = files.filter(file => file.toLowerCase().endsWith('.mp4'));
  const audioFiles = files.filter(file => file.toLowerCase().endsWith('.mp3'));

  return {
    videoFiles: videoFiles.map(file => path.join(resourcesDir, file)),
    audioFiles: audioFiles.map(file => path.join(resourcesDir, file))
  };
}

async function main() {
  const config = {
    openaiApiKey: process.env.OPENAI_API_KEY,
    openrouterApiKey: process.env.OPENROUTER_API_KEY,
    useProxy: process.env.USE_PROXY === 'true',
    httpProxy: process.env.HTTP_PROXY
  };

  const testMode = process.argv.includes('--test') || !config.openaiApiKey || !config.openrouterApiKey;
  
  if (!testMode && (!config.openaiApiKey || !config.openrouterApiKey)) {
    console.error('Error: Please set OPENAI_API_KEY and OPENROUTER_API_KEY environment variables');
    process.exit(1);
  }

  // Filter out --test flag from arguments
  const args = process.argv.filter(arg => arg !== '--test');
  let videoPath = args[2];
  let audioPath = args[3];

  if (!videoPath) {
    const { videoFiles, audioFiles } = scanResourcesDirectory();
    
    if (videoFiles.length === 0) {
      console.error('No video files found in resources directory and no video path provided');
      console.log('Usage: node video-analyzer.js [video_path] [audio_path]');
      console.log('Example: node video-analyzer.js ./video.mp4 ./audio.mp3');
      console.log('Or place video files in the resources/ directory');
      process.exit(1);
    }
    
    videoPath = videoFiles[0];
    console.log(`Using video file from resources: ${path.basename(videoPath)}`);
    
    // Try to find matching audio file
    if (!audioPath && audioFiles.length > 0) {
      const videoBasename = path.basename(videoPath, path.extname(videoPath));
      const matchingAudio = audioFiles.find(audioFile => {
        const audioBasename = path.basename(audioFile, path.extname(audioFile));
        // Check if audio filename contains or starts with video filename
        // Also check for common prefixes like "ssstik.io"
        const videoPrefix = videoBasename.split('_')[0]; // Get prefix before first underscore
        const audioPrefix = audioBasename.split('_')[0];
        return audioBasename.includes(videoBasename) || 
               videoBasename.includes(audioBasename) ||
               (videoPrefix === audioPrefix && videoPrefix.length > 3);
      });
      
      if (matchingAudio) {
        audioPath = matchingAudio;
        console.log(`Using matching audio file: ${path.basename(audioPath)}`);
      } else if (audioFiles.length > 0) {
        // If no perfect match, use the first available audio file
        audioPath = audioFiles[0];
        console.log(`Using available audio file: ${path.basename(audioPath)}`);
      }
    }
  }

  if (!fs.existsSync(videoPath)) {
    console.error(`Error: Video file not found: ${videoPath}`);
    process.exit(1);
  }

  if (audioPath && !fs.existsSync(audioPath)) {
    console.error(`Error: Audio file not found: ${audioPath}`);
    process.exit(1);
  }

  if (testMode) {
    console.log('=== TEST MODE ===');
    console.log('Video path detected:', videoPath);
    console.log('Audio path:', audioPath ? path.basename(audioPath) : 'Will extract from video');
    console.log('Video file exists:', fs.existsSync(videoPath));
    if (audioPath) {
      console.log('Audio file exists:', fs.existsSync(audioPath));
    }
    console.log('Proxy enabled:', config.useProxy);
    if (config.useProxy) {
      console.log('Proxy URL:', config.httpProxy);
    }
    
    const { videoFiles, audioFiles } = scanResourcesDirectory();
    console.log('\nFiles in resources directory:');
    console.log('Video files:', videoFiles.map(f => path.basename(f)));
    console.log('Audio files:', audioFiles.map(f => path.basename(f)));
    
    console.log('\nTest completed successfully! Set API keys to run full analysis.');
    return;
  }

  try {
    const analyzer = new VideoAnalyzer(config);
    const result = await analyzer.processVideo(videoPath, audioPath);
    
    console.log('\n=== ANALYSIS RESULTS ===');
    console.log('\n📝 Audio Transcription:');
    console.log(result.audioText);
    
    console.log('\n🖼️  Image Reverse Engineering:');
    console.log(result.imagePrompt);
    
    console.log('\n💡 Content Suggestion:');
    console.log(result.contentSuggestion);
    
    const timestamp = Date.now();
    const outputFile = `analysis_${timestamp}.json`;
    const markdownFile = `content_suggestion_${timestamp}.md`;
    
    fs.writeFileSync(outputFile, JSON.stringify(result, null, 2));
    
    const markdownContent = `# Content Suggestion

**Generated on:** ${new Date().toLocaleString()}

## Original Video Analysis

### Audio Transcription
${result.audioText}

### Image Description
${result.imagePrompt}

## Suggested Similar Content

${result.contentSuggestion}

---
*Generated by AI Video Content Analyzer*
`;
    
    fs.writeFileSync(markdownFile, markdownContent);
    console.log(`\n📄 Results saved to: ${outputFile}`);
    console.log(`📝 Content suggestion saved to: ${markdownFile}`);

  } catch (error) {
    console.error('Failed to process video:', error.message);
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}

module.exports = VideoAnalyzer;