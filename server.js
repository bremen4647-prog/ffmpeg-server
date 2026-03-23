const express = require('express');
const axios = require('axios');
const fs = require('fs');
const { execSync } = require('child_process');

const app = express();
app.use(express.json({ limit: '50mb' }));

async function downloadFile(url, filepath) {
  const response = await axios({ url, responseType: 'arraybuffer' });
  fs.writeFileSync(filepath, response.data);
}

app.post('/create-video', async (req, res) => {
  let { images, audioUrl, bgmUrl, srtContent } = req.body;
  const tmpDir = `/tmp/video_${Date.now()}`;
  fs.mkdirSync(tmpDir, { recursive: true });

  try {
    // images가 문자열이면 파싱
    if (typeof images === 'string') {
      images = JSON.parse(images);
    }

    // srtContent 줄바꿈 처리
    srtContent = srtContent.replace(/\\n/g, '\n');

    // 1. 이미지 5장 다운로드
    for (let i = 0; i < images.length; i++) {
      await downloadFile(images[i].imageUrl, `${tmpDir}/img_${i}.jpg`);
    }

    // 2. 음성 다운로드
    await downloadFile(audioUrl, `${tmpDir}/voice.mp3`);

    // 3. SRT 자막 파일 저장
    fs.writeFileSync(`${tmpDir}/subtitle.srt`, srtContent);

    // 4. 이미지 슬라이드쇼 만들기 (각 12초)
    const imgListFile = `${tmpDir}/imglist.txt`;
    const imgListContent = images.map((_, i) =>
      `file '${tmpDir}/img_${i}.jpg'\nduration 12`
    ).join('\n');
    fs.writeFileSync(imgListFile, imgListContent);

    // 5. FFmpeg 명령어 (BGM 있을 때와 없을 때 분리)
    const outputPath = `${tmpDir}/output.mp4`;
    const subtitleFilter = `subtitles=${tmpDir}/subtitle.srt:force_style='FontSize=18,PrimaryColour=&HFFFFFF&,OutlineColour=&H000000&,Outline=2,Alignment=2'`;

    if (bgmUrl) {
      await downloadFile(bgmUrl, `${tmpDir}/bgm.mp3`);
      execSync(`ffmpeg -f concat -safe 0 -i ${imgListFile} -i ${tmpDir}/voice.mp3 -i ${tmpDir}/bgm.mp3 -filter_complex "[0:v]scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,${subtitleFilter}[video];[1:a]volume=1.0[voice];[2:a]volume=0.2[bgm];[voice][bgm]amix=inputs=2:duration=first[audio]" -map "[video]" -map "[audio]" -c:v libx264 -c:a aac -shortest -y ${outputPath}`);
    } else {
      execSync(`ffmpeg -f concat -safe 0 -i ${imgListFile} -i ${tmpDir}/voice.mp3 -filter_complex "[0:v]scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,${subtitleFilter}[video]" -map "[video]" -map "1:a" -c:v libx264 -c:a aac -shortest -y ${outputPath}`);
    }

    // 6. 결과 파일 전송
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
