import { MsEdgeTTS, OUTPUT_FORMAT } from "msedge-tts";
import { execFileSync } from "child_process";
import fs from "fs";
import path from "path";

/**
 * Drop-in replacement for renderAvatarVideo() (heygenRender.js) that skips
 * HeyGen entirely. Converts the script to narration audio with edge-tts
 * (free, no API key), then lays it under a static branded background image
 * to produce a 1080x1920 video — same shape HeyGen used to produce, so
 * everything downstream (insertScenes, burnCaptions, appendEnding,
 * uploadToYouTube) keeps working unchanged.
 *
 * Same { outputPath, duration } return shape as renderAvatarVideo(), and
 * duration here is the REAL audio duration (via ffprobe), not an estimate —
 * so caption timing (buildCues) is now more accurate than it was in
 * HEYGEN_TEST_MODE, and about as accurate as it was with real HeyGen output.
 */
export async function renderVoiceVideo(script, { outputPath }) {
  const outDir = path.dirname(outputPath);
  const audioPath = path.join(outDir, "narration.mp3");

  await generateNarration(script, audioPath);
  const duration = getAudioDuration(audioPath);
  buildVideoFromAudio({ audioPath, duration, outputPath });

  return { outputPath, duration };
}

async function generateNarration(script, audioPath) {
  const voice = process.env.TTS_VOICE || "en-US-GuyNeural";
  const tts = new MsEdgeTTS();
  await tts.setMetadata(voice, OUTPUT_FORMAT.AUDIO_24KHZ_48KBITRATE_MONO_MP3);
  await tts.toFile(audioPath, script, {
    rate: process.env.TTS_RATE || "+0%",
    pitch: process.env.TTS_PITCH || "+0Hz",
  });
}

function getAudioDuration(audioPath) {
  const out = execFileSync("ffprobe", [
    "-v", "error",
    "-show_entries", "format=duration",
    "-of", "default=noprint_wrappers=1:nokey=1",
    audioPath,
  ]);
  return parseFloat(out.toString().trim());
}

function buildVideoFromAudio({ audioPath, duration, outputPath }) {
  const bgPath = process.env.BRAND_BACKGROUND_PATH ||
    path.join(path.dirname(new URL(import.meta.url).pathname), "../assets/payrecon-logo.png");

  const hasCustomBg = fs.existsSync(bgPath);

  const args = hasCustomBg
    ? [
        "-y",
        "-loop", "1",
        "-i", bgPath,
        "-i", audioPath,
        "-vf", "scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,setsar=1",
        "-c:v", "libx264",
        "-tune", "stillimage",
        "-c:a", "aac",
        "-b:a", "192k",
        "-pix_fmt", "yuv420p",
        "-t", String(duration),
        outputPath,
      ]
    : [
        // Fallback: same gray canvas createPlaceholderVideo.js used, but with real narration audio
        "-y",
        "-f", "lavfi",
        "-i", `color=c=gray:s=1080x1920:d=${duration}`,
        "-i", audioPath,
        "-c:v", "libx264",
        "-c:a", "aac",
        "-b:a", "192k",
        "-pix_fmt", "yuv420p",
        "-shortest",
        outputPath,
      ];

  execFileSync("ffmpeg", args, { stdio: "inherit" });
}
