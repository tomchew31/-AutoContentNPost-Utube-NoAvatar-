// src/pipeline.js
// Orchestrates: research -> script -> edge-tts voice -> ffmpeg video -> YouTube upload
// This replaces the old HeyGen step with generateVoice() + assembleVideo().

import "dotenv/config";
import path from "path";
import fs from "fs/promises";
import { runResearch } from "./research.js";
import { generateScript } from "./script.js";
import { generateVoice } from "./tts.js";
import { assembleVideo } from "./video.js";
import { uploadToYouTube } from "./upload.js";

const WORK_DIR = path.resolve("work", `run-${Date.now()}`);
const BACKGROUND_IMAGE = path.resolve("assets", "brand-background.png"); // swap in your branded 1920x1080 image

async function main() {
  await fs.mkdir(WORK_DIR, { recursive: true });

  console.log("1/5 Running research...");
  const researchData = await runResearch(process.env.TOPIC || "WMS inventory tips for e-commerce sellers");

  console.log("2/5 Generating script...");
  const script = await generateScript(researchData);

  console.log("3/5 Generating voice (edge-tts)...");
  const { audioPath, srtPath } = await generateVoice(script.narration, WORK_DIR);

  console.log("4/5 Assembling video (ffmpeg)...");
  const videoPath = path.join(WORK_DIR, "final.mp4");
  await assembleVideo({
    audioPath,
    srtPath,
    backgroundImage: BACKGROUND_IMAGE,
    outPath: videoPath,
  });

  console.log("5/5 Uploading to YouTube...");
  await uploadToYouTube({
    videoPath,
    title: script.title,
    description: script.description,
  });

  console.log("Done:", videoPath);
}

main().catch((err) => {
  console.error("Pipeline failed:", err);
  process.exit(1);
});
