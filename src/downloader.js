const fs = require('fs');
const path = require('path');
const ffmpeg = require('fluent-ffmpeg');

const DOWNLOAD_DIR = process.env.DOWNLOAD_DIR || '/tmp/netmirror_downloads';
if (!fs.existsSync(DOWNLOAD_DIR)) {
  fs.mkdirSync(DOWNLOAD_DIR, { recursive: true });
}

/**
 * Downloads and muxes video stream + specific audio track into an MP4 file
 * @param {Object} options
 * @param {string} options.videoUrl - Video M3U8 URL
 * @param {string} options.audioUrl - Audio M3U8 URL (optional)
 * @param {string} options.referer - Referer header
 * @param {string} options.title - Movie title for filename
 * @param {Function} options.onProgress - Progress callback function (percent)
 * @returns {Promise<string>} Path to finished MP4 file
 */
function downloadAndMuxVideo({ videoUrl, audioUrl, referer, title, onProgress }) {
  return new Promise((resolve, reject) => {
    const safeTitle = (title || 'video').replace(/[^a-zA-Z0-9_-]/g, '_').substring(0, 30);
    const outputPath = path.join(DOWNLOAD_DIR, `${safeTitle}_${Date.now()}.mp4`);

    const headersOption = `Referer: ${referer}\r\nUser-Agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:136.0) Gecko/20100101 Firefox/136.0 /OS.GatuNewTV v1.0\r\n`;

    let command = ffmpeg();

    // Input 0: Video stream
    command
      .input(videoUrl)
      .inputOptions([
        '-extension_picky', '0',
        '-allowed_extensions', 'ALL',
        '-allowed_segment_extensions', 'ALL',
        '-headers', headersOption,
        '-protocol_whitelist', 'file,http,https,tcp,tls,crypto',
      ]);

    // Input 1: Separate Audio stream if present
    if (audioUrl) {
      command
        .input(audioUrl)
        .inputOptions([
          '-extension_picky', '0',
          '-allowed_extensions', 'ALL',
          '-allowed_segment_extensions', 'ALL',
          '-headers', headersOption,
          '-protocol_whitelist', 'file,http,https,tcp,tls,crypto',
        ]);
      
      // Map video from input 0 and audio from input 1
      command.outputOptions([
        '-map', '0:v:0',
        '-map', '1:a:0',
        '-c:v', 'copy',
        '-c:a', 'aac',
        '-b:a', '128k',
        '-movflags', '+faststart',
      ]);
    } else {
      command.outputOptions([
        '-c:v', 'copy',
        '-c:a', 'aac',
        '-b:a', '128k',
        '-movflags', '+faststart',
      ]);
    }

    command
      .output(outputPath)
      .on('progress', (progress) => {
        if (onProgress && progress.percent) {
          onProgress(Math.min(100, Math.round(progress.percent)));
        }
      })
      .on('end', () => {
        resolve(outputPath);
      })
      .on('error', (err) => {
        if (fs.existsSync(outputPath)) {
          try { fs.unlinkSync(outputPath); } catch (e) {}
        }
        reject(err);
      });

    command.run();
  });
}

/**
 * Remove local downloaded file
 */
function cleanupFile(filePath) {
  try {
    if (filePath && fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
  } catch (e) {
    console.error(`[Cleanup Error] Failed to delete ${filePath}:`, e.message);
  }
}

module.exports = {
  downloadAndMuxVideo,
  cleanupFile,
  DOWNLOAD_DIR,
};
