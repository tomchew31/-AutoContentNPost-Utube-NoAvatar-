import fetch from "node-fetch";
import fs from "fs";

/**
 * Publishes a post to LinkedIn via the Posts API — with the actual video
 * attached natively (not just a text post), when videoPath is given.
 *
 * LinkedIn access tokens expire (typically 60 days) and refreshing them
 * programmatically requires the "Community Management API" product
 * approval, which is a manual review process on LinkedIn's side. For a
 * one-person operation, the practical approach is:
 *   1. Generate a token via LinkedIn's OAuth flow periodically (manual step)
 *   2. Store it as a GitHub Actions secret
 *   3. Re-run the auth flow when it expires (roughly every 2 months)
 *
 * Native video upload additionally requires the "w_member_social" scope
 * (same scope as text posts) — no extra LinkedIn app review needed for
 * personal-profile posting, only for posting as an Organization Page with
 * some LinkedIn product tiers. If video upload ever fails (permissions,
 * size/duration limits, etc.), this falls back to a text-only post rather
 * than losing the post entirely.
 */
export async function postToLinkedIn(text, videoPath) {
  const accessToken = process.env.LINKEDIN_ACCESS_TOKEN;
  const authorUrn = process.env.LINKEDIN_AUTHOR_URN; // e.g. "urn:li:person:xxxx" or "urn:li:organization:xxxx"

  if (!accessToken || !authorUrn) {
    throw new Error(
      "Missing LINKEDIN_ACCESS_TOKEN / LINKEDIN_AUTHOR_URN env vars"
    );
  }

  let mediaBlock = { shareMediaCategory: "NONE" };

  if (videoPath) {
    try {
      const assetUrn = await uploadVideoAsset({ videoPath, authorUrn, accessToken });
      mediaBlock = {
        shareMediaCategory: "VIDEO",
        media: [{ status: "READY", media: assetUrn }],
      };
    } catch (err) {
      console.error(
        "      LinkedIn video upload failed, posting as text-only instead:",
        err.message
      );
    }
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
          ...mediaBlock,
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

/**
 * Registers a video upload with LinkedIn, uploads the file's bytes, and
 * returns the resulting asset URN to attach to a post.
 * https://learn.microsoft.com/en-us/linkedin/marketing/integrations/community-management/shares/videos-api
 */
async function uploadVideoAsset({ videoPath, authorUrn, accessToken }) {
  const registerRes = await fetch("https://api.linkedin.com/v2/assets?action=registerUpload", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      registerUploadRequest: {
        recipes: ["urn:li:digitalmediaRecipe:feedshare-video"],
        owner: authorUrn,
        serviceRelationships: [
          {
            relationshipType: "OWNER",
            identifier: "urn:li:userGeneratedContent",
          },
        ],
      },
    }),
  });

  if (!registerRes.ok) {
    const errText = await registerRes.text();
    throw new Error(`registerUpload failed (${registerRes.status}): ${errText}`);
  }

  const registerData = await registerRes.json();
  const uploadUrl =
    registerData.value.uploadMechanism[
      "com.linkedin.digitalmedia.uploading.MediaUploadHttpRequest"
    ].uploadUrl;
  const assetUrn = registerData.value.asset;

  const videoBuffer = fs.readFileSync(videoPath);
  const uploadRes = await fetch(uploadUrl, {
    method: "PUT",
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
    body: videoBuffer,
  });

  if (!uploadRes.ok) {
    const errText = await uploadRes.text();
    throw new Error(`Video binary upload failed (${uploadRes.status}): ${errText}`);
  }

  return assetUrn;
}
