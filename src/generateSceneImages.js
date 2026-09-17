import Anthropic from "@anthropic-ai/sdk";
import fetch from "node-fetch";
import fs from "fs";
import path from "path";

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

/**
 * Turns each research point into a short visual-image prompt, then
 * generates an image for it via Pollinations.ai — a free, no-API-key image
 * generation service. Returns one file path per point, in the same order.
 *
 * If any single image fails to generate, that point is skipped (not fatal
 * to the whole run) — insertScenes.js handles a shorter-than-expected array.
 */
export async function generateSceneImages(points, outDir) {
  const imageDir = path.join(outDir, "scenes");
  fs.mkdirSync(imageDir, { recursive: true });

  const prompts = await Promise.all(points.map((point) => buildImagePrompt(point)));

  const results = [];
  for (let i = 0; i < prompts.length; i++) {
    try {
      const imagePath = path.join(imageDir, `scene-${i + 1}.jpg`);
      await downloadImage(prompts[i], imagePath);
      results.push(imagePath);
    } catch (err) {
      console.error(`      Scene image ${i + 1} failed (skipping this scene):`, err.message);
    }
  }
  return results;
}

async function buildImagePrompt(point) {
  const response = await anthropic.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 150,
    messages: [
      {
        role: "user",
        content: `Turn this fact/tip into a short (10-20 word) prompt for an AI
image generator, describing a realistic B-roll style photo that visually
represents it. Context: warehouse/retail/e-commerce operations. No text or
logos in the image, no real brand names, no identifiable real people.

Fact/tip: "${point}"

Output ONLY the image prompt, nothing else.`,
      },
    ],
  });

  const textBlock = response.content.find((b) => b.type === "text");
  return textBlock ? textBlock.text.trim() : point;
}

async function downloadImage(prompt, outputPath) {
  const encoded = encodeURIComponent(prompt);
  const url = `https://image.pollinations.ai/prompt/${encoded}?width=1080&height=1920&nologo=true`;
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Pollinations request failed: ${res.status}`);
  }
  const buffer = await res.arrayBuffer();
  fs.writeFileSync(outputPath, Buffer.from(buffer));
}
