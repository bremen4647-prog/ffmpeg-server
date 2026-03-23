const express = require('express');
const axios = require('axios');
const fs = require('fs');
const { execSync } = require('child_process');

const app = express();
app.use(express.json({ limit: '50mb' }));

async function downloadFile(url, filepath) {
  const response = await axios({ url, responseType: 'arraybuffer', timeout: 30000 });
  fs.writeFileSync(filepath, response.data);
}

app.post('/create-video', async (req, res) => {
  let { images, audioUrl, bgmUrl, srtContent } = req.body;
  const tmpDir = `/tmp/video_${Date.now()}`;
  fs.mkdirSync(tmpDir, { recursive: true });

  try {
    if (typeof images === 'string') images = JSON.parse(images);
    srtContent = srtContent.replace(/\\n/g, '\n');

    // 이미지 다운로드
    for (let i = 0; i < images.length; i++) {
      await downloadFile(images[i].imageUrl, `${tmpDir}/img_${i}.jpg`);
    }

    // 음성 다운로드
    await downloadFile(audioUrl, `${tmpDir}/voice.mp3`);

    // 이미지 리스트 파일
    const imgListFile = `${tmpDir}/imglist.txt`;
    const imgListContent = images.map((_, i) =>
      `file '${tmpDir}/img_${i}.jpg'\nduration 12`
    ).join('\n');
    fs.writeFileSync(imgListFile, imgListContent);

    const outputPath = `${tmpDir}/output.mp4`;

    // 자막 없이 영상 합치기 (메모리 절약)
    execSync(`ffmpeg -f concat -safe 0 -i ${imgListFile} -i ${tmpDir}/voice.mp3 -vf "scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920" -map 0:v -map 1:a -c:v libx264 -preset ultrafast -crf 28 -c:a aac -shortest -y ${outputPath}`, {
      maxBuffer: 1024 * 1024 * 100
    });

    const videoBuffer = fs.readFileSync(outputPath);
    res.set('Content-Type', 'video/mp4');
    res.send(videoBuffer);

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

app.get('/health', (req, res) => res.json({ status: 'ok' }));
app.listen(3000, () => console.log('FFmpeg server running on port 3000'));
