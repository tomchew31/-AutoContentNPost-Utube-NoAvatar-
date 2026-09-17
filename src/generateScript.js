import Anthropic from "@anthropic-ai/sdk";

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

/**
 * Turns research points into a spoken-word script for an edge-tts narration video.
 * Keeps it tight: at a typical spoken pace of roughly 2.3-2.6 words/second, a
 * 45-60s video needs roughly 100-150 words.
 */
export async function generateScript(topic, researchPoints) {
  const response = await anthropic.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 600,
    messages: [
      {
        role: "user",
        content: `Write a spoken-word script for a 45-60 second talking-avatar video
for PayRecon, a cloud Warehouse Management System (WMS) used across
e-commerce, retail, and supply chain/logistics operations in Southeast Asia.

Topic: "${topic}"
Research points to draw from:
${researchPoints.map((p) => `- ${p}`).join("\n")}

Rules:
- 100-150 words total, natural spoken cadence, no stage directions or bracketed notes
- Open with a hook in the first sentence
- Plain conversational language, second person ("you"), no jargon
- End with a soft CTA to follow or check the link for more
- Output ONLY the spoken script text, nothing else`,
      },
    ],
  });

  const textBlock = response.content.find((b) => b.type === "text");
  return textBlock ? textBlock.text.trim() : "";
}

/**
 * Companion LinkedIn post (native text post) derived from the same research,
 * so one day's topic produces both assets without a second research pass.
 */
export async function generateLinkedInPost(topic, researchPoints) {
  const response = await anthropic.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 500,
    messages: [
      {
        role: "user",
        content: `Write a native LinkedIn post (300-500 words) for PayRecon, a cloud
Warehouse Management System (WMS) used across e-commerce, retail, and supply
chain/logistics operations in Southeast Asia — targeting founders, ops
managers, and supply chain/logistics leads.

Topic: "${topic}"
Research points:
${researchPoints.map((p) => `- ${p}`).join("\n")}

Rules:
- Strong hook as the first line
- Short paragraphs/line breaks, no hashtag spam (3-5 relevant hashtags max at the end)
- Practical and specific, not generic motivational tone
- Output ONLY the post text`,
      },
    ],
  });

  const textBlock = response.content.find((b) => b.type === "text");
  return textBlock ? textBlock.text.trim() : "";
}
