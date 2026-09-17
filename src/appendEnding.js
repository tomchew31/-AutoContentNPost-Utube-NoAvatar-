import { execFileSync } from "child_process";

/**
 * Appends an ending/outro clip onto the main video. Normalizes both clips'
 * fps, resolution, pixel format, and audio format before concatenating —
 * this makes the join robust even if the ending clip and the main video
 * (edge-tts narration render) don't perfectly match on every technical
 * property, at the cost of a re-encode (concat demuxer would be faster but
 * requires exact stream compatibility, which isn't guaranteed here).
 */
export function appendEnding({ videoPath, endingPath, outputPath }) {
  const filterComplex = [
    "[0:v]fps=30,scale=1080:1920:force_original_aspect_ratio=decrease,pad=1080:1920:(ow-iw)/2:(oh-ih)/2,setsar=1[v0]",
    "[1:v]fps=30,scale=1080:1920:force_original_aspect_ratio=decrease,pad=1080:1920:(ow-iw)/2:(oh-ih)/2,setsar=1[v1]",
    "[0:a]aresample=44100,aformat=channel_layouts=stereo[a0]",
    "[1:a]aresample=44100,aformat=channel_layouts=stereo[a1]",
    "[v0][a0][v1][a1]concat=n=2:v=1:a=1[outv][outa]",
  ].join(";");

  execFileSync(
    "ffmpeg",
    [
      "-y",
      "-i", videoPath,
      "-i", endingPath,
      "-filter_complex", filterComplex,
      "-map", "[outv]",
      "-map", "[outa]",
      outputPath,
    ],
    { stdio: "inherit" }
  );

  return outputPath;
}
