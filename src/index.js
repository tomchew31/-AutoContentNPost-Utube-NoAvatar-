import "dotenv/config";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { pickTrendingTopic } from "./pickTrendingTopic.js";
import { research } from "./research.js";
import { generateScript, generateLinkedInPost } from "./generateScript.js";
import { renderVoiceVideo } from "./voiceRender.js";
import { generateThumbnail } from "./generateThumbnail.js";
import { uploadToYouTube, setThumbnail } from "./youtubeUpload.js";
import { postToLinkedIn } from "./linkedinPost.js";
import { buildCues, cuesToSrt } from "./buildSrt.js";
import { burnCaptions } from "./burnCaptions.js";
import { appendEnding } from "./appendEnding.js";
import { generateSceneImages } from "./generateSceneImages.js";
import { insertScenes } from "./insertScenes.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const LOGO_PATH = path.join(__dirname, "../assets/payrecon-logo.png");
const ENDING_PATH = path.join(__dirname, "../assets/ending.mp4");

const DRY_RUN = process.env.DRY_RUN === "true";

const HISTORY_PATH = path.join(__dirname, "../data/topic-history.json");
const MAX_HISTORY_ENTRIES = 30; // keep the file small — pickTrendingTopic.js only reads the last 10 anyway

function recordTopicHistory(topic) {
  try {
    let history = [];
    if (fs.existsSync(HISTORY_PATH)) {
      history = JSON.parse(fs.readFileSync(HISTORY_PATH, "utf-8"));
    }
    history.push({ topic, date: new Date().toISOString().slice(0, 10) });
    if (history.length > MAX_HISTORY_ENTRIES) {
      history = history.slice(-MAX_HISTORY_ENTRIES);
    }
    fs.writeFileSync(HISTORY_PATH, JSON.stringify(history, null, 2));
  } catch (err) {
    // Never let history tracking break the actual run
    console.error("      (non-fatal) Failed to record topic history:", err.message);
  }
}

async function main() {
  const topic = await pickTrendingTopic();
  console.log(`[1/10] Topic: ${topic}`);
  recordTopicHistory(topic);

  const points = await research(topic);
  console.log(`[2/10] Research points:\n${points.map((p) => `  - ${p}`).join("\n")}`);

  const [script, linkedinPost] = await Promise.all([
    generateScript(topic, points),
    generateLinkedInPost(topic, points),
  ]);
  console.log(`[3/10] Script (${script.split(/\s+/).length} words):\n${script}`);

  // Always save outputs locally so a failed later step doesn't lose the work
  const outDir = path.join(process.cwd(), "output", new Date().toISOString().slice(0, 10));
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(path.join(outDir, "script.txt"), script);
  fs.writeFileSync(path.join(outDir, "linkedin-post.txt"), linkedinPost);

  if (DRY_RUN) {
    console.log("DRY_RUN=true — stopping before render/upload. Check the output/ folder.");
    return;
  }

  console.log("[4/10] Generating thumbnail...");
  const thumbnailPath = await generateThumbnail(topic, outDir);
  if (thumbnailPath) {
    console.log(`      Saved to ${thumbnailPath}`);
  } else {
    console.log("      Skipped — YouTube will auto-pick a frame instead.");
  }

  const videoPath = path.join(outDir, "video.mp4");
  console.log("[5/10] Generating narration (edge-tts) and building base video...");
  const { duration } = await renderVoiceVideo(script, { outputPath: videoPath });
  console.log(`      Saved to ${videoPath} (duration: ${duration}s)`);

  console.log("[6/10] Generating scene images (one per research point) and inserting as cutaways...");
  let sceneVideoPath = videoPath;
  try {
    const imagePaths = await generateSceneImages(points, outDir);
    console.log(`      Generated ${imagePaths.length}/${points.length} scene images.`);
    if (imagePaths.length > 0) {
      const scenesOutPath = path.join(outDir, "video-with-scenes.mp4");
      insertScenes({ videoPath, imagePaths, duration, outputPath: scenesOutPath });
      sceneVideoPath = scenesOutPath;
      console.log("      Scenes inserted.");
    } else {
      console.log("      No scene images generated — continuing without cutaways.");
    }
  } catch (err) {
    // Don't fail the whole run over scene images — continue with the plain avatar video
    console.error("      Scene generation/insertion failed (non-fatal), continuing without cutaways:", err.message);
  }

  console.log("[7/10] Burning English captions onto the video...");
  const cues = buildCues(script, duration);
  fs.writeFileSync(path.join(outDir, "captions.srt"), cuesToSrt(cues)); // reference copy only
  const captionedPath = path.join(outDir, "video-captioned.mp4");
  let uploadPath = sceneVideoPath;
  try {
    burnCaptions({ videoPath: sceneVideoPath, cues, outDir, outputPath: captionedPath, logoPath: LOGO_PATH });
    uploadPath = captionedPath;
    console.log("      Captions burned in.");
  } catch (err) {
    // Don't fail the whole run over captions — upload the plain video instead
    console.error("      Caption burn-in failed (non-fatal), uploading without captions:", err.message);
  }

  console.log("[8/10] Appending ending clip...");
  const finalPath = path.join(outDir, "video-final.mp4");
  try {
    appendEnding({ videoPath: uploadPath, endingPath: ENDING_PATH, outputPath: finalPath });
    uploadPath = finalPath;
    console.log("      Ending appended.");
  } catch (err) {
    // Don't fail the whole run over the ending clip — upload without it instead
    console.error("      Appending ending failed (non-fatal), uploading without it:", err.message);
  }

  console.log("[9/10] Uploading to YouTube...");
  const ytResult = await uploadToYouTube({
    filePath: uploadPath,
    title: topic.slice(0, 95), // YouTube title limit is 100 chars
    description: `${script}\n\nPayRecon — Warehouse Management System for e-commerce, retail, and supply chain teams in Southeast Asia.\n\nLooking for FREE Consultation, contact / Whatsapp us today:\n📞 Tom - 6011-63122766\n📩 Whatsapp - https://tinyurl.com/4ucjsc8w\n.\nPrefer we contact you? Fill out this form:\n🔗 https://forms.gle/NncBspz4XPi2jDLq8\n.\n#payrecon #warehousemanagement #WMS #inventorymanagement #inventorycontrol #MDEC #DigitalMalaysia #SME #SMES`,
    tags: ["warehousemanagement", "supplychain", "retail", "ecommerce", "logistics", "inventorymanagement", "wms"],
  });
  console.log(`      Uploaded: https://youtube.com/watch?v=${ytResult.id} (status: ${process.env.YOUTUBE_PUBLISH_STATUS || "private"})`);

  if (thumbnailPath) {
    try {
      await setThumbnail({ videoId: ytResult.id, thumbnailPath });
      console.log("      Custom thumbnail set.");
    } catch (err) {
      // Common cause: the channel doesn't have a verified phone number yet
      // (a YouTube requirement for custom thumbnails, not an API bug).
      console.error("      Setting custom thumbnail failed (non-fatal), YouTube will auto-pick a frame instead:", err.message);
    }
  }

  console.log("[10/10] Posting to LinkedIn...");
  if (process.env.LINKEDIN_ACCESS_TOKEN) {
    await postToLinkedIn(linkedinPost, uploadPath);
    console.log("      Posted.");
  } else {
    console.log("      Skipped (no LINKEDIN_ACCESS_TOKEN set) — see output/.../linkedin-post.txt to post manually.");
  }

  console.log("Done.");
}

main().catch((err) => {
  console.error("Pipeline failed:", err);
  process.exit(1);
});
