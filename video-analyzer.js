#!/usr/bin/env node

require('dotenv').config({ path: '.env.local' });

const { Supadata } = require('@supadata/js');
const axios = require('axios');

class VideoAnalyzer {
  constructor(config) {
    this.supadataApiKey = config.supadataApiKey;
    this.openrouterApiKey = config.openrouterApiKey;
    this.useProxy = config.useProxy;
    this.httpProxy = config.httpProxy;
    
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

      // Extract text content from the result
      if (typeof transcriptResult === 'string') {
        return transcriptResult;
      } else if (transcriptResult.text) {
        return transcriptResult.text;
      } else if (transcriptResult.content) {
        return transcriptResult.content;
      } else {
        return transcriptResult;
      }
    } catch (error) {
      throw new Error(`URL转录失败: ${error.message}`);
    }
  }

  async extractTopicSummary(transcriptText) {
    try {
      if (!this.openrouterApiKey) {
        throw new Error('OpenRouter API key not configured');
      }

      console.log('正在使用GPT-4o-mini提炼转录内容的核心主题...');
      
      // Ensure we have a string, not an object
      const textContent = typeof transcriptText === 'string' ? transcriptText : 
                         (transcriptText.content || transcriptText.text || JSON.stringify(transcriptText));
      
      const prompt = `Extract the core topic, theme, and key points from this video transcript. Provide a concise summary that captures:
1. The main topic/subject
2. Key specific details (tools, strategies, names, numbers, etc.)
3. The content format/structure (list, tutorial, review, etc.)
4. Target audience and purpose

Transcript: "${textContent}"

Please provide a focused summary in 2-3 sentences that preserves all the specific details and context needed to understand what this content is about.`;

      const axiosConfig = {
        headers: {
          'Authorization': `Bearer ${this.openrouterApiKey}`,
          'HTTP-Referer': 'https://github.com/ai-tk-rewrite',
          'X-Title': 'AI Transcript Rewriter',
          'Content-Type': 'application/json'
        },
        timeout: 60000
      };
      
      // Add proxy configuration for axios if enabled
      if (this.useProxy && this.httpProxy) {
        const { HttpsProxyAgent } = require('https-proxy-agent');
        axiosConfig.httpsAgent = new HttpsProxyAgent(this.httpProxy);
      }

      const response = await axios.post(
        'https://openrouter.ai/api/v1/chat/completions',
        {
          model: 'openai/gpt-4o-mini',
          messages: [
            {
              role: 'user',
              content: prompt
            }
          ],
          max_tokens: 300
        },
        axiosConfig
      );

      return response.data.choices[0].message.content;
    } catch (error) {
      if (error.response && error.response.status === 429) {
        throw new Error(`API请求频率限制，请稍后重试`);
      }
      if (error.message.includes('insufficient_quota')) {
        throw new Error(`API配额不足，请检查账户余额`);
      }
      throw new Error(`主题提炼失败: ${error.message}`);
    }
  }

  async suggestSimilarTopic(transcriptText) {
    try {
      if (!this.openrouterApiKey) {
        throw new Error('OpenRouter API key not configured');
      }

      // Ensure we have a string, not an object
      const textContent = typeof transcriptText === 'string' ? transcriptText : 
                         (transcriptText.content || transcriptText.text || JSON.stringify(transcriptText));
      
      console.log('转录文本类型:', typeof transcriptText);
      console.log('转录文本长度:', textContent.length);
      
      // First extract topic summary using GPT-4o-mini
      const topicSummary = await this.extractTopicSummary(textContent);
      console.log('✅ 主题提炼完成:', topicSummary);

      console.log('正在使用Perplexity生成同题不同解的话题方向...');
      
      const prompt = `Suggest a content idea different from this video transcript summary: "${topicSummary}". It should be in the same niche and on the exact same topic or content idea but offer fresh value. You must pick one idea from your research that matches the topic idea of the video script exactly but is also different and unique from it so it would stand out on social media. Example: if the video script contains a list of tools, your topic must also be a list of tools in that video script topic but slightly different, maybe different tools etc. If the video's script is about a plan, strategies, or whatever, you must also make your topic about that. So you must maintain the nature of the topic in the video script. You absolutely must be specific as the original video script. You can't just mention generic tools or strategies if the original video script contains specific tools. Etc. That is the level of accuracy and perfect matching of the video script original topic. Make sure it appeals to a broad audience like the example.`;

      const axiosConfig = {
        headers: {
          'Authorization': `Bearer ${this.openrouterApiKey}`,
          'HTTP-Referer': 'https://github.com/ai-tk-rewrite',
          'X-Title': 'AI Transcript Rewriter',
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
          model: 'perplexity/sonar-reasoning',
          messages: [
            {
              role: 'user',
              content: prompt
            }
          ],
          max_tokens: 800
        },
        axiosConfig
      );

      return response.data.choices[0].message.content;
    } catch (error) {
      if (error.response && error.response.status === 429) {
        throw new Error(`API请求频率限制，请稍后重试`);
      }
      if (error.message.includes('insufficient_quota')) {
        throw new Error(`API配额不足，请检查账户余额`);
      }
      throw new Error(`话题建议生成失败: ${error.message}`);
    }
  }

  cleanPerplexityResponse(response) {
    // Remove <think> blocks from Perplexity response
    return response.replace(/<think>[\s\S]*?<\/think>/g, '').trim();
  }

  async rewriteContent(originalTranscript, topicSuggestion) {
    try {
      if (!this.openrouterApiKey) {
        throw new Error('OpenRouter API key not configured');
      }

      console.log('正在使用GPT-4o重写脚本、标题和覆盖字...');
      
      const prompt = `Based on the original transcript and the topic suggestion, create a completely rewritten version that is optimized for oral presentation (口播) and follows the exact same structure but with different content.

Original Transcript: "${originalTranscript}"
Topic Suggestion: "${topicSuggestion}"

Please create content specifically designed for oral presentation with these requirements:

1. **ORAL SCRIPT**: A rewritten script that is perfect for speaking aloud, including:
   - Natural conversational tone and rhythm
   - Easy-to-pronounce words and phrases
   - Clear transitions between ideas
   - Appropriate pauses and emphasis points marked with [PAUSE], [EMPHASIS]
   - Hook opening that grabs attention immediately
   - Strong conclusion with clear call-to-action
   - Timing suggestions for each section

2. **ENGAGING CAPTION**: Social media caption/title that promises value

3. **OVERLAY TEXT**: Key visual text that complements the oral delivery

Format your response as JSON with these exact keys:
{
  "script": "The complete oral presentation script with speaking cues...",
  "caption": "Engaging social media caption...",
  "overlay": "Key overlay text suggestions..."
}

IMPORTANT: The script must be optimized for natural speech delivery, using conversational language, clear pronunciation, and logical flow that sounds natural when spoken aloud. Include speaking cues like [PAUSE], [EMPHASIS], [SLOW DOWN] where appropriate. The content should follow the same structure as the original but cover the new suggested topic in a way that's engaging for oral presentation.`;

      const axiosConfig = {
        headers: {
          'Authorization': `Bearer ${this.openrouterApiKey}`,
          'HTTP-Referer': 'https://github.com/ai-tk-rewrite',
          'X-Title': 'AI Transcript Rewriter',
          'Content-Type': 'application/json'
        },
        timeout: 60000
      };
      
      // Add proxy configuration for axios if enabled
      if (this.useProxy && this.httpProxy) {
        const { HttpsProxyAgent } = require('https-proxy-agent');
        axiosConfig.httpsAgent = new HttpsProxyAgent(this.httpProxy);
      }

      const response = await axios.post(
        'https://openrouter.ai/api/v1/chat/completions',
        {
          model: 'openai/gpt-4o',
          messages: [
            {
              role: 'user',
              content: prompt
            }
          ],
          max_tokens: 1500
        },
        axiosConfig
      );

      const content = response.data.choices[0].message.content;
      
      // Try to parse JSON response
      try {
        return JSON.parse(content);
      } catch (parseError) {
        // If JSON parsing fails, return structured content
        return {
          script: content,
          caption: "Generated content - see script for details",
          overlay: "Key points from rewritten content"
        };
      }
    } catch (error) {
      if (error.response && error.response.status === 429) {
        throw new Error(`API请求频率限制，请稍后重试`);
      }
      if (error.message.includes('insufficient_quota')) {
        throw new Error(`API配额不足，请检查账户余额`);
      }
      throw new Error(`内容重写失败: ${error.message}`);
    }
  }

  splitRewrittenContent(rewrittenContent) {
    // Split the rewritten content into three sections
    return {
      overlay: rewrittenContent.overlay || "覆盖字内容",
      script: rewrittenContent.script || "脚本内容",
      caption: rewrittenContent.caption || "标题内容"
    };
  }

}

async function main() {
  const config = {
    supadataApiKey: process.env.SUPADATA_API_KEY,
    openrouterApiKey: process.env.OPENROUTER_API_KEY,
    useProxy: process.env.USE_PROXY === 'true',
    httpProxy: process.env.HTTP_PROXY
  };

  const enableSecondaryCreation = process.argv.includes('--rewrite');
  const testMode = process.argv.includes('--test') || !config.supadataApiKey;
  
  // Filter out flags from arguments
  const args = process.argv.filter(arg => arg !== '--test' && arg !== '--rewrite');
  
  // Get URL from arguments
  const url = args[2];
  
  if (!url) {
    console.error('Error: URL is required');
    console.log('Usage: node video-analyzer.js <URL> [--rewrite]');
    console.log('Example: node video-analyzer.js https://www.youtube.com/watch?v=dQw4w9WgXcQ');
    console.log('Example: node video-analyzer.js https://www.youtube.com/watch?v=dQw4w9WgXcQ --rewrite');
    console.log('Supported platforms: YouTube, TikTok, Instagram, X (Twitter)');
    console.log('--rewrite: Enable secondary creation flow (requires OPENROUTER_API_KEY)');
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

  if (enableSecondaryCreation && !config.openrouterApiKey) {
    console.error('Error: OPENROUTER_API_KEY environment variable is required for --rewrite mode');
    process.exit(1);
  }

  if (testMode) {
    console.log('=== TEST MODE ===');
    console.log('URL detected:', url);
    console.log('Supadata API key:', config.supadataApiKey ? 'Set' : 'Not set');
    console.log('OpenRouter API key:', config.openrouterApiKey ? 'Set' : 'Not set');
    console.log('Secondary creation enabled:', enableSecondaryCreation);
    console.log('Proxy enabled:', config.useProxy);
    if (config.useProxy) {
      console.log('Proxy URL:', config.httpProxy);
    }
    console.log('\nTest completed successfully! Set required API keys to run full analysis.');
    return;
  }

  try {
    const analyzer = new VideoAnalyzer(config);
    
    console.log('Starting URL transcript analysis...');
    console.log('URL:', url);
    
    const audioText = await analyzer.transcribeFromUrl(url);
    
    let result = {
      audioText,
      timestamp: new Date().toISOString(),
      source: 'url',
      url: url
    };
    
    console.log('\n=== ANALYSIS RESULTS ===');
    console.log('\n📝 Audio Transcription:');
    console.log(result.audioText);
    
    // Secondary creation flow if enabled
    if (enableSecondaryCreation) {
      console.log('\n=== STARTING SECONDARY CREATION FLOW ===');
      
      // Step 1: Suggest Similar Topic (Perplexity)
      const topicSuggestion = await analyzer.suggestSimilarTopic(audioText);
      console.log('\n💡 Topic Suggestion (Raw):');
      console.log(topicSuggestion);
      
      // Step 2: Clean Perplexity Response
      const cleanedSuggestion = analyzer.cleanPerplexityResponse(topicSuggestion);
      console.log('\n🧹 Cleaned Topic Suggestion:');
      console.log(cleanedSuggestion);
      
      // Step 3: Rewrite Content (GPT-4o)
      const rewrittenContent = await analyzer.rewriteContent(audioText, cleanedSuggestion);
      console.log('\n📝 Rewritten Content:');
      console.log(JSON.stringify(rewrittenContent, null, 2));
      
      // Step 4: Split Content into Sections
      const splitContent = analyzer.splitRewrittenContent(rewrittenContent);
      console.log('\n📂 Split Content Sections:');
      console.log('Overlay:', splitContent.overlay);
      console.log('Script:', splitContent.script);
      console.log('Caption:', splitContent.caption);
      
      // Add secondary creation results to the main result
      result.secondaryCreation = {
        topicSuggestion: cleanedSuggestion,
        rewrittenContent: rewrittenContent,
        splitSections: splitContent
      };
    }
    
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
    
    // Save secondary creation files if enabled
    if (enableSecondaryCreation && result.secondaryCreation) {
      const rewriteDir = path.join(transcriptsDir, 'rewrites');
      if (!fs.existsSync(rewriteDir)) {
        fs.mkdirSync(rewriteDir, { recursive: true });
      }
      
      const scriptFile = path.join(rewriteDir, `script_${timestamp}.txt`);
      const captionFile = path.join(rewriteDir, `caption_${timestamp}.txt`);
      const overlayFile = path.join(rewriteDir, `overlay_${timestamp}.txt`);
      const oralScriptFile = path.join(rewriteDir, `oral_script_${timestamp}.md`);
      
      fs.writeFileSync(scriptFile, result.secondaryCreation.splitSections.script);
      fs.writeFileSync(captionFile, result.secondaryCreation.splitSections.caption);
      fs.writeFileSync(overlayFile, result.secondaryCreation.splitSections.overlay);
      
      // Create a formatted oral script with markdown for better readability
      const oralScriptContent = `# 口播脚本 (Oral Presentation Script)

## 基本信息
- **原始URL**: ${url}
- **生成时间**: ${new Date().toLocaleString()}
- **话题建议**: ${result.secondaryCreation.topicSuggestion}

## 社媒标题
${result.secondaryCreation.splitSections.caption}

## 完整口播脚本
${result.secondaryCreation.splitSections.script}

## 覆盖字建议
${result.secondaryCreation.splitSections.overlay}

---

## 使用提示
1. 脚本中的 [PAUSE] 表示停顿
2. [EMPHASIS] 表示需要重音强调
3. [SLOW DOWN] 表示需要放慢语速
4. 建议先练习朗读，调整语速和停顿
5. 可根据个人风格微调用词和表达
`;
      
      fs.writeFileSync(oralScriptFile, oralScriptContent);
      
      console.log(`\n🎙️ Oral Script saved to: ${oralScriptFile}`);
      console.log(`📄 Script saved to: ${scriptFile}`);
      console.log(`📝 Caption saved to: ${captionFile}`);
      console.log(`🎯 Overlay saved to: ${overlayFile}`);
    }
    
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