// src/tts.js
// Converts script text into narration audio (mp3) + captions (srt) using edge-tts.
// Free, no API key required.

import { MsEdgeTTS, OUTPUT_FORMAT } from "msedge-tts";
import fs from "fs/promises";
import path from "path";

const VOICE = process.env.TTS_VOICE || "en-US-GuyNeural"; // pick any edge-tts voice
const RATE = process.env.TTS_RATE || "+0%";
const PITCH = process.env.TTS_PITCH || "+0Hz";

/**
 * @param {string} scriptText - the narration script (from your script-generation step)
 * @param {string} outDir - directory to write audio.mp3 and captions.srt into
 * @returns {Promise<{audioPath: string, srtPath: string}>}
 */
export async function generateVoice(scriptText, outDir) {
  await fs.mkdir(outDir, { recursive: true });

  const tts = new MsEdgeTTS();
  await tts.setMetadata(VOICE, OUTPUT_FORMAT.AUDIO_24KHZ_48KBITRATE_MONO_MP3);

  const audioPath = path.join(outDir, "audio.mp3");
  const srtPath = path.join(outDir, "captions.srt");

  // toFile also gives us word-boundary metadata we can use for rough caption timing
  const { audioFilePath, subtitle } = await tts.toFile(audioPath, scriptText, {
    rate: RATE,
    pitch: PITCH,
  });

  // msedge-tts returns subtitle cues; convert to basic SRT
  const srt = buildSrt(subtitle || []);
  await fs.writeFile(srtPath, srt, "utf-8");

  return { audioPath: audioFilePath || audioPath, srtPath };
}

function msToSrtTime(ms) {
  const date = new Date(ms);
  const hh = String(date.getUTCHours()).padStart(2, "0");
  const mm = String(date.getUTCMinutes()).padStart(2, "0");
  const ss = String(date.getUTCSeconds()).padStart(2, "0");
  const mmm = String(date.getUTCMilliseconds()).padStart(3, "0");
  return `${hh}:${mm}:${ss},${mmm}`;
}

function buildSrt(cues) {
  if (!cues.length) return "";
  return cues
    .map((cue, i) => {
      const start = msToSrtTime(cue.offset / 10000); // edge-tts offsets are in 100ns ticks
      const end = msToSrtTime((cue.offset + cue.duration) / 10000);
      return `${i + 1}\n${start} --> ${end}\n${cue.text}\n`;
    })
    .join("\n");
}
