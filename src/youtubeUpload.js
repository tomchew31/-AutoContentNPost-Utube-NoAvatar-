import { google } from "googleapis";
import fs from "fs";

/**
 * Uploads an English caption track for an existing YouTube video.
 * https://developers.google.com/youtube/v3/docs/captions/insert
 */
export async function uploadCaptions({ videoId, srtContent }) {
  const oauth2Client = new google.auth.OAuth2(
    process.env.YOUTUBE_CLIENT_ID,
    process.env.YOUTUBE_CLIENT_SECRET
  );
  oauth2Client.setCredentials({
    refresh_token: process.env.YOUTUBE_REFRESH_TOKEN,
  });

  const youtube = google.youtube({ version: "v3", auth: oauth2Client });

  const res = await youtube.captions.insert({
    part: ["snippet"],
    requestBody: {
      snippet: {
        videoId,
        language: "en",
        name: "English",
        isDraft: false,
      },
    },
    media: {
      mimeType: "application/octet-stream",
      body: srtContent,
    },
  });

  return res.data;
}

/**
 * Uploads a finished video to YouTube as a Short/video.
 *
 * Requires a one-time OAuth setup (see README) to obtain a refresh token
 * for the channel you want to publish to. Once you have that refresh
 * token, this runs unattended.
 *
 * Publishes as "private" by default so you can review before it goes
 * public -- see PUBLISH_STATUS in README for how to change this.
 */
export async function uploadToYouTube({ filePath, title, description, tags }) {
  const oauth2Client = new google.auth.OAuth2(
    process.env.YOUTUBE_CLIENT_ID,
    process.env.YOUTUBE_CLIENT_SECRET
  );
  oauth2Client.setCredentials({
    refresh_token: process.env.YOUTUBE_REFRESH_TOKEN,
  });

  const youtube = google.youtube({ version: "v3", auth: oauth2Client });

  const res = await youtube.videos.insert({
    part: ["snippet", "status"],
    requestBody: {
      snippet: {
        title,
        description,
        tags,
        categoryId: "22", // People & Blogs; change if a better fit exists
      },
      status: {
        privacyStatus: process.env.YOUTUBE_PUBLISH_STATUS || "private",
        selfDeclaredMadeForKids: false,
      },
    },
    media: {
      body: fs.createReadStream(filePath),
    },
  });

  return res.data; // includes the new video's id
}
