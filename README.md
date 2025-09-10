# Video Content Analyzer

基于AI的视频内容分析工具，可以提取视频的音频转录、图像分析和内容建议。

## 功能特性

- 📹 提取视频第一帧图片
- 🎙️ 使用 Whisper API 转录音频为文字
- 🖼️ 使用 GPT-4o-mini 分析图片并生成重建提示
- 💡 使用 Perplexity 生成相似但独特的内容主题建议

## 安装

```bash
npm install
```

## 配置

1. 复制环境变量示例文件：
```bash
cp .env.example .env
```

2. 在 `.env` 文件中填入你的API密钥：
```
OPENAI_API_KEY=your_openai_api_key_here
OPENROUTER_API_KEY=your_openrouter_api_key_here
```

## 使用方法

```bash
node video-analyzer.js <video_path> <audio_path>
```

示例：
```bash
node video-analyzer.js ./video.mp4 ./audio.mp3
```

## 输出

脚本会输出分析结果并保存为JSON文件，包含：
- 音频转录文本
- 图片逆向工程提示
- 内容建议
- 时间戳

## 依赖

- openai: OpenAI API客户端
- axios: HTTP请求库
- form-data: 表单数据处理
- sharp: 图片处理
- fluent-ffmpeg: 视频处理

https://www.youtube.com/watch?v=EdEn3aWHpO8