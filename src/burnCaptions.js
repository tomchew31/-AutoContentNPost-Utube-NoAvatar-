import { execFileSync } from "child_process";
import fs from "fs";
import path from "path";

/**
 * Overlays the logo, then burns in captions using drawtext (not the
 * "subtitles"/libass filter). This is a deliberate switch: the libass
 * approach went through many rounds of FontSize/MarginV tuning that
 * repeatedly failed to produce consistent, predictable results (identical
 * values sometimes rendering completely differently), likely due to
 * ASS "script resolution" scaling ambiguity that proved hard to pin down.
 * drawtext uses plain pixel coordinates and the same enable='between(t,...)'
 * timing technique already proven reliable for the scene-image cutaways —
 * much easier to reason about.
 *
 * Each cue's text is written to its own small .txt file and referenced via
 * drawtext's textfile= option, rather than embedded inline in the filter
 * string — this sidesteps the notoriously fiddly quote-escaping needed for
 * natural-language sentences (apostrophes in "here's", "don't", etc.)
 * inside an inline text= value.
 */
export function burnCaptions({ videoPath, cues, outDir, outputPath, logoPath }) {
  const workingVideo = logoPath
    ? overlayLogo({ videoPath, logoPath })
    : videoPath;

  burnCaptionsOnly({ videoPath: workingVideo, cues, outDir, outputPath });

  return outputPath;
}

// Top banner band settings — override via env if you want a different
// color/size without editing code. BANNER_BG_COLOR accepts any ffmpeg color
// name or 0xRRGGBB hex value.
const BANNER_BG_COLOR = process.env.BANNER_BG_COLOR || "0xFF7A1A"; // brand orange
const BANNER_LOGO_WIDTH = 480;
const BANNER_PADDING = 30; // px above/below the logo, inside the orange band

function overlayLogo({ videoPath, logoPath }) {
  const dir = path.dirname(videoPath);
  const withLogoPath = path.join(dir, "video-with-logo.mp4");

  // Actual pixel dimensions of assets/payrecon-logo.png (2898x585) used to
  // compute the scaled logo's real height, so the orange band is sized
  // exactly around it rather than guessed.
  const LOGO_NATIVE_WIDTH = 2898;
  const LOGO_NATIVE_HEIGHT = 585;
  const scaledLogoHeight = Math.round((LOGO_NATIVE_HEIGHT / LOGO_NATIVE_WIDTH) * BANNER_LOGO_WIDTH);
  const bandHeight = scaledLogoHeight + BANNER_PADDING * 2;

  execFileSync(
    "ffmpeg",
    [
      "-y",
      "-i", videoPath,
      "-i", logoPath,
      "-filter_complex",
      `[0:v]drawbox=x=0:y=0:w=iw:h=${bandHeight}:color=${BANNER_BG_COLOR}:t=fill[boxed];` +
      `[1:v]scale=${BANNER_LOGO_WIDTH}:-1[logo];` +
      `[boxed][logo]overlay=(main_w-overlay_w)/2:${BANNER_PADDING}`,
      "-c:a", "copy",
      withLogoPath,
    ],
    { stdio: "inherit" }
  );

  return withLogoPath;
}

// Real pixel values now — no more ASS "script resolution" ambiguity.
const CANVAS_WIDTH = 1080;
const FONT_SIZE = 44;
const LINE_SPACING = 10;
const MAX_TEXT_WIDTH = 950;   // leaves ~65px margin on each side
// Bold sans-serif font file for drawtext (drawtext has no "bold" flag —
// weight comes entirely from which font file you point it at). DejaVu Sans
// Bold ships via the fonts-dejavu-core apt package, installed alongside
// ffmpeg in the workflow. Override with a different bold .ttf path if you'd
// rather match a specific brand font.
const FONT_FILE = process.env.CAPTION_FONT_FILE || "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf";

function burnCaptionsOnly({ videoPath, cues, outDir, outputPath }) {
  if (!cues || cues.length === 0) {
    execFileSync("ffmpeg", ["-y", "-i", videoPath, "-c", "copy", outputPath], {
      stdio: "inherit",
    });
    return;
  }

  const cueDir = path.join(outDir, "caption-cues");
  fs.mkdirSync(cueDir, { recursive: true });

  // Rough heuristic: average character width ≈ FONT_SIZE * 0.55 for a
  // typical sans-serif font. Good enough to avoid overflowing the frame
  // without needing to actually measure rendered text width.
  const charsPerLine = Math.floor(MAX_TEXT_WIDTH / (FONT_SIZE * 0.55));

  const drawtextFilters = cues.map((cue, i) => {
    const wrapped = wrapText(cue.text, charsPerLine);
    const lineCount = wrapped.split("\n").length;
    const cueFile = path.join(cueDir, `cue-${i + 1}.txt`);
    fs.writeFileSync(cueFile, wrapped);

    // y centers the text block vertically in the frame, regardless of how
    // many lines this particular cue wraps into.
    const blockHeight = lineCount * (FONT_SIZE + LINE_SPACING);
    const y = `(h-${blockHeight})/2`;

    // Escape the textfile path for ffmpeg's filter parser (colons are a
    // filter-option separator; unlikely in a Linux path here, but safe).
    const escapedPath = cueFile.replace(/\\/g, "/").replace(/:/g, "\\:");
    const escapedFontFile = FONT_FILE.replace(/\\/g, "/").replace(/:/g, "\\:");

    return (
      `drawtext=fontfile='${escapedFontFile}':textfile='${escapedPath}':fontsize=${FONT_SIZE}:fontcolor=white:` +
      `borderw=3:bordercolor=black:line_spacing=${LINE_SPACING}:` +
      `x=(w-text_w)/2:y=${y}:enable='between(t,${cue.start.toFixed(2)},${cue.end.toFixed(2)})'`
    );
  });

  execFileSync(
    "ffmpeg",
    [
      "-y",
      "-i", videoPath,
      "-vf", drawtextFilters.join(","),
      "-c:a", "copy",
      outputPath,
    ],
    { stdio: "inherit" }
  );
}

/** Greedy word-wrap into lines of at most `maxChars` characters. */
function wrapText(text, maxChars) {
  const words = text.split(/\s+/);
  const lines = [];
  let current = "";

  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (candidate.length > maxChars && current) {
      lines.push(current);
      current = word;
    } else {
      current = candidate;
    }
  }
  if (current) lines.push(current);

  return lines.join("\n");
}
