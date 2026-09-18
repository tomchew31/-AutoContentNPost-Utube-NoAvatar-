import Anthropic from "@anthropic-ai/sdk";
import { readFileSync, existsSync } from "fs";
import { fileURLToPath } from "url";
import path from "path";
import { pickTopic as pickFallbackTopic } from "./pickTopic.js";

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const topics = JSON.parse(
  readFileSync(path.join(__dirname, "../data/topics.json"), "utf-8")
);

const HISTORY_PATH = path.join(__dirname, "../data/topic-history.json");
const RECENT_LOOKBACK = 10; // how many past picks to avoid repeating

function getRecentTopics() {
  if (!existsSync(HISTORY_PATH)) return [];
  try {
    const history = JSON.parse(readFileSync(HISTORY_PATH, "utf-8"));
    return history.slice(-RECENT_LOOKBACK).map((entry) => entry.topic);
  } catch {
    return []; // corrupt/missing history file is never fatal — just means no dedup this run
  }
}

/**
 * Uses Claude + web search to pick today's topic based on what's currently
 * trending / most searched in Southeast Asia (Singapore, Malaysia,
 * Indonesia, Philippines, Thailand, Vietnam) around e-commerce, inventory,
 * warehousing, retail operations, or supply chain — instead of the plain
 * day-of-year rotation.
 *
 * Avoids repeating any of the last RECENT_LOOKBACK topics (tracked in
 * data/topic-history.json, committed back to the repo by the workflow
 * after each run) so a topic that stays trending for multiple days in a
 * row doesn't get picked over and over — it still ranks highly, just not
 * picked twice in a row.
 *
 * Falls back to the deterministic rotation in pickTopic.js if the search
 * fails or returns something unusable, so a bad API call never blocks the
 * whole run.
 */
export async function pickTrendingTopic(date = new Date()) {
  try {
    const recentTopics = getRecentTopics();
    const avoidBlock = recentTopics.length
      ? `\nAvoid repeating any of these recently-used topics, even if they're
still trending — pick the next-best distinct one instead:
${recentTopics.map((t) => `- ${t}`).join("\n")}\n`
      : "";

    const response = await anthropic.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 300,
      tools: [{ type: "web_search_20250305", name: "web_search" }],
      messages: [
        {
          role: "user",
          content: `You're picking today's topic for a PayRecon (WMS software) YouTube
Short aimed at e-commerce, retail, and supply chain/logistics businesses in
Southeast Asia (Singapore, Malaysia, Indonesia, Philippines, Thailand,
Vietnam).

Search for what's currently trending or most searched in Southeast Asia
right now related to e-commerce, inventory management, warehousing, retail
operations, or supply chain.

Candidate topics already on hand:
${topics.map((t) => `- ${t}`).join("\n")}
${avoidBlock}
Pick whichever candidate topic best matches current search interest, OR if
none fit well, propose ONE closely related topic in the same style/scope
(short, specific, about warehouse/inventory/e-commerce operations in SEA).

Output ONLY the chosen topic as a single line of plain text, nothing else.`,
        },
      ],
    });

    const textBlock = response.content.find((b) => b.type === "text");
    const topic = textBlock?.text?.trim();

    if (topic && topic.length > 5 && topic.length < 150) {
      return topic;
    }
    throw new Error("Trending topic pick returned something unusable");
  } catch (err) {
    console.error(
      "      Trending topic pick failed (falling back to day-of-year rotation):",
      err.message
    );
    return pickFallbackTopic(date);
  }
}
