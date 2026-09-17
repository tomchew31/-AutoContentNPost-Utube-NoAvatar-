import fetch from "node-fetch";

/**
 * Publishes a text post to LinkedIn via the Posts API.
 *
 * LinkedIn access tokens expire (typically 60 days) and refreshing them
 * programmatically requires the "Community Management API" product
 * approval, which is a manual review process on LinkedIn's side. For a
 * one-person operation, the practical approach is:
 *   1. Generate a token via LinkedIn's OAuth flow periodically (manual step)
 *   2. Store it as a GitHub Actions secret
 *   3. Re-run the auth flow when it expires (roughly every 2 months)
 *
 * This is the main reason LinkedIn posting is harder to fully "set and
 * forget" than YouTube, where the refresh token doesn't expire.
 */
export async function postToLinkedIn(text) {
  const accessToken = process.env.LINKEDIN_ACCESS_TOKEN;
  const authorUrn = process.env.LINKEDIN_AUTHOR_URN; // e.g. "urn:li:person:xxxx" or "urn:li:organization:xxxx"

  if (!accessToken || !authorUrn) {
    throw new Error(
      "Missing LINKEDIN_ACCESS_TOKEN / LINKEDIN_AUTHOR_URN env vars"
    );
  }

  const res = await fetch("https://api.linkedin.com/v2/ugcPosts", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
      "X-Restli-Protocol-Version": "2.0.0",
    },
    body: JSON.stringify({
      author: authorUrn,
      lifecycleState: "PUBLISHED",
      specificContent: {
        "com.linkedin.ugc.ShareContent": {
          shareCommentary: { text },
          shareMediaCategory: "NONE",
        },
      },
      visibility: {
        "com.linkedin.ugc.MemberNetworkVisibility": "PUBLIC",
      },
    }),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`LinkedIn post failed (${res.status}): ${errText}`);
  }

  return res.json();
}
