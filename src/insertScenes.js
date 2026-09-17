import { execFileSync } from "child_process";

/**
 * Overlays each image as a full-screen cutaway during an even slice of the
 * video's total duration — e.g. 4 images over a 60s video each get a 15s
 * window. The underlying video's audio (the avatar's narration) keeps
 * playing continuously; only the visual swaps to the image during its
 * window, then back to the avatar.
 *
 * If given zero images, just copies the video through unchanged.
 */
export function insertScenes({ videoPath, imagePaths, duration, outputPath }) {
  if (!imagePaths || imagePaths.length === 0) {
    execFileSync("ffmpeg", ["-y", "-i", videoPath, "-c", "copy", outputPath], {
      stdio: "inherit",
    });
    return outputPath;
  }

  const n = imagePaths.length;
  const windowLength = duration / n;

  const inputArgs = imagePaths.flatMap((imgPath) => ["-i", imgPath]);

  const filterParts = [];
  // Scale/pad each image input (index 1..n, since 0 is the base video) to
  // fill the 1080x1920 frame, cropping any excess rather than letterboxing.
  imagePaths.forEach((_, i) => {
    filterParts.push(
      `[${i + 1}:v]scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,setsar=1[img${i}]`
    );
  });

  let lastLabel = "0:v";
  imagePaths.forEach((_, i) => {
    const start = (i * windowLength).toFixed(2);
    const end = ((i + 1) * windowLength).toFixed(2);
    const outLabel = i === n - 1 ? "vout" : `v${i}`;
    filterParts.push(
      `[${lastLabel}][img${i}]overlay=0:0:enable='between(t,${start},${end})'[${outLabel}]`
    );
    lastLabel = outLabel;
  });

  const filterComplex = filterParts.join(";");

  execFileSync(
    "ffmpeg",
    [
      "-y",
      "-i", videoPath,
      ...inputArgs,
      "-filter_complex", filterComplex,
      "-map", "[vout]",
      "-map", "0:a",
      "-c:a", "copy",
      outputPath,
    ],
    { stdio: "inherit" }
  );

  return outputPath;
}
