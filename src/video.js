// src/video.js
// Combines TTS audio + a branded background image + burned-in captions into an mp4.
// Requires ffmpeg installed on the runner (the GitHub Actions workflow installs it).

import { execFile } from "child_process";
import { promisify } from "util";
import path from "path";

const execFileAsync = promisify(execFile);

/**
 * @param {object} opts
 * @param {string} opts.audioPath - path to narration mp3
 * @param {string} opts.srtPath - path to captions srt
 * @param {string} opts.backgroundImage - path to a static branded image (1920x1080)
 * @param {string} opts.outPath - path to write the final mp4
 */
export async function assembleVideo({ audioPath, srtPath, backgroundImage, outPath }) {
  // Escape path for ffmpeg's subtitles filter (colons need escaping on some shells)
  const escapedSrt = srtPath.replace(/:/g, "\\:");

  const args = [
    "-y",
    "-loop", "1",
    "-i", backgroundImage,
    "-i", audioPath,
    "-vf", `subtitles=${escapedSrt}:force_style='Fontsize=28,PrimaryColour=&HFFFFFF&,OutlineColour=&H000000&,BorderStyle=3'`,
    "-c:v", "libx264",
    "-tune", "stillimage",
    "-c:a", "aac",
    "-b:a", "192k",
    "-pix_fmt", "yuv420p",
    "-shortest",
    outPath,
  ];

  await execFileAsync("ffmpeg", args);
  return outPath;
}
