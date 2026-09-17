import Anthropic from "@anthropic-ai/sdk";
import fetch from "node-fetch";
import { execFileSync } from "child_process";
import fs from "fs";
import path from "path";

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const THUMB_WIDTH = 1280;
const THUMB_HEIGHT = 720;
const BANNER_BG_COLOR = process.env.BANNER_BG_COLOR || "0xFF7A1A"; // same brand orange as the video's top banner
const FONT_FILE = process.env.CAPTION_FONT_FILE || "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf";

/**
 * Generates a 1280x720 clickable YouTube thumbnail for the given topic:
 * a dramatic AI-generated background (via Pollinations.ai, same free
 * service as scene images) with a bold, high-contrast headline overlaid,
 * darkened for legibility, plus a small brand badge in the corner that
 * doubles as covering Pollinations' watermark.
 *
 * Returns the thumbnail's file path, or null if generation failed at any
 * step (never fatal to the overall run — index.js just skips setting a
 * custom thumbnail and YouTube uses its own auto-picked frame instead).
 */
export async function generateThumbnail(topic, outDir) {
  try {
    const thumbDir = path.join(outDir, "thumbnail");
    fs.mkdirSync(thumbDir, { recursive: true });

    const bgPrompt = await buildBackgroundPrompt(topic);
    const bgPath = path.join(thumbDir, "background.jpg");
    await downloadImage(bgPrompt, bgPath);

    const headline = await buildHeadline(topic);
    const thumbnailPath = path.join(thumbDir, "thumbnail.jpg");
    composeThumbnail({ bgPath, headline, thumbnailPath });

    return thumbnailPath;
  } catch (err) {
    console.error("      Thumbnail generation failed (skipping custom thumbnail):", err.message);
    return null;
  }
}

async function buildBackgroundPrompt(topic) {
  const response = await anthropic.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 150,
    messages: [
      {
        role: "user",
        content: `Write a short (15-25 word) prompt for an AI image generator, for a
DRAMATIC, high-contrast, attention-grabbing YouTube thumbnail BACKGROUND
photo (not illustration) about this warehouse/e-commerce/supply chain
topic: "${topic}".

Style: cinematic lighting, shallow depth of field, slightly dark/moody so
bold white text overlays well. No text, no logos, no real brand names, no
identifiable real people, no watermarks.

Output ONLY the image prompt, nothing else.`,
      },
    ],
  });
  const textBlock = response.content.find((b) => b.type === "text");
  return textBlock ? textBlock.text.trim() : topic;
}

async function buildHeadline(topic) {
  const response = await anthropic.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 100,
    messages: [
      {
        role: "user",
        content: `Turn this video topic into a SHORT, punchy YouTube thumbnail headline
(under 6 words, ALL CAPS, curiosity/urgency-driven but not misleading —
this is for a legitimate B2B warehouse management software brand, not
clickbait garbage). No punctuation except a question mark if it genuinely
fits.

Topic: "${topic}"

Output ONLY the headline text, nothing else.`,
      },
    ],
  });
  const textBlock = response.content.find((b) => b.type === "text");
  return (textBlock ? textBlock.text.trim() : topic).toUpperCase();
}

async function downloadImage(prompt, outputPath) {
  const encoded = encodeURIComponent(prompt);
  const url = `https://image.pollinations.ai/prompt/${encoded}?width=${THUMB_WIDTH}&height=${THUMB_HEIGHT}&nologo=true`;
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Pollinations request failed: ${res.status}`);
  }
  const buffer = await res.arrayBuffer();
  fs.writeFileSync(outputPath, Buffer.from(buffer));
}

function composeThumbnail({ bgPath, headline, thumbnailPath }) {
  const headlineFile = path.join(path.dirname(thumbnailPath), "headline.txt");
  // ~35 chars/line fits comfortably at this font size across 1280px width
  fs.writeFileSync(headlineFile, wrapText(headline, 18));

  const escapedHeadline = headlineFile.replace(/\\/g, "/").replace(/:/g, "\\:");
  const escapedFont = FONT_FILE.replace(/\\/g, "/").replace(/:/g, "\\:");

  // Corner badge covers Pollinations' watermark (bottom-right) and doubles
  // as a small brand mark.
  const badgeWidth = 190;
  const badgeHeight = 46;

  execFileSync(
    "ffmpeg",
    [
      "-y",
      "-i", bgPath,
      "-vf",
      // 1) scale/crop to exactly 1280x720 in case Pollinations returns a
      //    slightly different size
      `scale=${THUMB_WIDTH}:${THUMB_HEIGHT}:force_original_aspect_ratio=increase,` +
      `crop=${THUMB_WIDTH}:${THUMB_HEIGHT},` +
      // 2) darken the lower half so white text stays legible over any background
      `drawbox=x=0:y=${THUMB_HEIGHT * 0.45}:w=${THUMB_WIDTH}:h=${THUMB_HEIGHT * 0.55}:color=black@0.55:t=fill,` +
      // 3) bold headline, bottom-left, big and high-contrast
      `drawtext=fontfile='${escapedFont}':textfile='${escapedHeadline}':fontsize=76:fontcolor=white:` +
      `borderw=6:bordercolor=black:line_spacing=14:x=50:y=main_h-text_h-140,` +
      // 4) small brand badge, bottom-right (also covers the watermark)
      `drawbox=x=${THUMB_WIDTH - badgeWidth}:y=${THUMB_HEIGHT - badgeHeight}:w=${badgeWidth}:h=${badgeHeight}:color=${BANNER_BG_COLOR}:t=fill,` +
      `drawtext=fontfile='${escapedFont}':text='PAYRECON WMS':fontsize=22:fontcolor=white:` +
      `x=${THUMB_WIDTH - badgeWidth + 14}:y=${THUMB_HEIGHT - badgeHeight + 12}`,
      "-frames:v", "1",
      thumbnailPath,
    ],
    { stdio: "inherit" }
  );
}

function wrapText(text, maxCharsPerLine) {
  const words = text.split(/\s+/);
  const lines = [];
  let current = "";
  for (const word of words) {
    if ((current + " " + word).trim().length > maxCharsPerLine && current) {
      lines.push(current.trim());
      current = word;
    } else {
      current = (current + " " + word).trim();
    }
  }
  if (current) lines.push(current.trim());
  return lines.join("\n");
}
