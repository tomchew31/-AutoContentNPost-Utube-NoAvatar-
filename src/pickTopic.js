import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import path from "path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const topics = JSON.parse(
  readFileSync(path.join(__dirname, "../data/topics.json"), "utf-8")
);

/**
 * Deterministic day-of-year modulo topic selection, mirroring the SEO pipeline.
 * Same logic could be offset so the video topic never lands on the same day
 * as the blog topic, if you want them to stay distinct.
 */
export function pickTopic(date = new Date()) {
  const start = new Date(date.getFullYear(), 0, 0);
  const diff = date - start;
  const dayOfYear = Math.floor(diff / (1000 * 60 * 60 * 24));
  const index = dayOfYear % topics.length;
  return topics[index];
}
