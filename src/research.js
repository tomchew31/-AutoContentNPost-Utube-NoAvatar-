import Anthropic from "@anthropic-ai/sdk";

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

/**
 * Uses Claude + web search to gather 3-5 current, specific facts or angles
 * on the day's topic, so the script isn't generic filler.
 */
export async function research(topic) {
  const response = await anthropic.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 1200,
    tools: [{ type: "web_search_20250305", name: "web_search" }],
    messages: [
      {
        role: "user",
        content: `Research this topic for a short (45-60 second) YouTube video aimed at
Southeast Asian businesses that run warehouses or manage inventory — across
e-commerce (Shopee, Lazada, TikTok Shop), brick-and-mortar/omnichannel retail,
and broader supply chain and logistics operations: "${topic}".

Find 3-5 concrete, current, specific points (a stat, an industry practice,
a common mistake, or a practical tip). Avoid generic advice. Return ONLY a
JSON array of short strings, one per point, nothing else.`,
      },
    ],
  });

  const textBlock = response.content.find((b) => b.type === "text");
  const raw = textBlock ? textBlock.text.trim() : "[]";

  try {
    const cleaned = raw.replace(/```json|```/g, "").trim();
    return JSON.parse(cleaned);
  } catch {
    // Fall back to treating the raw text as a single point rather than failing the run
    return [raw];
  }
}
