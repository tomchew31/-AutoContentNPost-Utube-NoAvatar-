# PayRecon Daily Voice Video Pipeline

Daily automated pipeline: research a topic → write a script → render it as a
narrated video (edge-tts voice over branded visuals, no avatar) → upload to
YouTube. Also generates a companion LinkedIn post from the same research
(optional auto-post, or copy/paste manually).

```
pickTopic → research (Claude + web search) → generateScript / generateLinkedInPost
          → renderVoiceVideo (edge-tts)     → uploadToYouTube
                                             → postToLinkedIn (optional)
```

Same shape as your SEO article pipeline: Node.js + GitHub Actions, deterministic
day-of-year topic rotation, credentials as GitHub Secrets.

## 1. Install

```bash
npm install
cp .env.example .env
```

## 2. Get your credentials

**Anthropic** — you already have this for the SEO pipeline; reuse the same key.

**edge-tts (voice)** — no signup, no API key. Optionally set `TTS_VOICE` in
`.env` to any edge-tts voice name (defaults to `en-US-GuyNeural`). Add a
1080x1920 branded background image at `assets/payrecon-logo.png` (or point
`BRAND_BACKGROUND_PATH` at your own file) — if neither exists, it falls back
to a plain gray background.

**YouTube (Data API v3)**
1. In [Google Cloud Console](https://console.cloud.google.com), create a
   project, enable the "YouTube Data API v3".
2. Create OAuth 2.0 credentials (type: Desktop app) → gives you
   `YOUTUBE_CLIENT_ID` and `YOUTUBE_CLIENT_SECRET`.
3. Run through the OAuth consent flow **once** for the channel you're
   publishing to, requesting the `https://www.googleapis.com/auth/youtube.upload`
   scope. (An earlier version of this README also asked for
   `youtube.force-ssl` for a selectable-caption-track feature — that's no
   longer used, see the Captions section below, so `youtube.upload` alone
   is enough now.)

   The simplest way is Google's [OAuth Playground](https://developers.google.com/oauthplayground):
   set your own client ID/secret in its settings, authorize that scope,
   exchange for tokens, and copy the **refresh token** — that's
   `YOUTUBE_REFRESH_TOKEN`. It doesn't expire unless revoked.
4. Your app will be in "Testing" mode in Google's console at first, which
   works fine for your own channel; publishing to other people's channels
   would need Google's verification review.

**LinkedIn (optional)**
1. Create an app at [LinkedIn Developers](https://www.linkedin.com/developers/apps),
   request the "Share on LinkedIn" product.
2. Run the OAuth flow to get an access token and your author URN
   (`urn:li:person:...` for your personal profile, or
   `urn:li:organization:...` for a Company Page).
3. **Caveat:** LinkedIn tokens expire roughly every 60 days and refreshing
   them programmatically needs a LinkedIn product approval most solo devs
   won't have. Practically: re-run the OAuth flow every couple of months and
   update the GitHub secret. If you'd rather skip this hassle, leave
   `LINKEDIN_ACCESS_TOKEN` unset — the pipeline still writes the post text to
   `output/<date>/linkedin-post.txt` for you to paste in manually.

## 3. Test locally before automating

```bash
# Cheap test: just generates script + LinkedIn post text, no render/upload
DRY_RUN=true npm start

# Full run including narration render + YouTube upload (uses YouTube quota; edge-tts is free)
npm start
```

Videos upload as **private** by default (`YOUTUBE_PUBLISH_STATUS=private`) so
you can review in YouTube Studio before anyone sees them. Once you trust the
output quality, flip it to `public` in the workflow file.

## 4. Push to GitHub and add your secrets

1. Push this repo to GitHub (already done if you're reading this from the
   live repo).
2. Add every variable from `.env.example` as a repository secret
   (Settings → Secrets and variables → Actions → New repository secret).
   Names must match exactly (e.g. `ANTHROPIC_API_KEY`, `YOUTUBE_CLIENT_ID`, etc.)
   — these are what the workflow file references. `TTS_VOICE` can be a
   repository **variable** instead, since it isn't sensitive.

## Scene images

For each research point, an AI image is generated (via Pollinations.ai —
free, no API key needed) and inserted as a full-screen cutaway during an
even slice of the video's runtime. The narration and your captions keep
playing continuously underneath — only the visual swaps between the
background and each scene image.

If image generation fails for any point (or all of them), the run
continues without cutaways rather than failing — check the logs for
"Scene generation/insertion failed" if this happens repeatedly.

## Captions

Captions are burned directly onto the video (visible automatically, no
tapping "CC" required) using ffmpeg, styled for a vertical Short: white
text, black outline, bottom-center, positioned clear of YouTube's Shorts UI
overlay. This is different from — and better for Shorts than — YouTube's
selectable caption-track feature, which stays hidden until a viewer taps CC
(almost nobody does while scrolling Shorts).

No extra account or OAuth scope is needed for this — ffmpeg is installed as
a workflow step and runs entirely within the GitHub Actions job, free.

If the styling looks off once you see real output (too big/small, wrong
position), adjust the `style` values in `src/burnCaptions.js` — `FontSize`
and `MarginV` are the two most likely to need tuning.

## Scheduling: cron-job.org (not GitHub's native schedule)

GitHub's built-in `schedule:` trigger was unreliable for this repo (stopped
firing entirely, a known platform-level issue independent of the workflow's
config). The daily trigger now comes from **cron-job.org** instead, which
calls the workflow_dispatch API endpoint directly on a real external timer.

**Only run one trigger source at a time.** The workflow file intentionally
has no `schedule:` block anymore — if you ever re-add one, disable the
cron-job.org job first, or you'll get duplicate daily videos and double
edge-tts/YouTube API usage.

Setup (already done if you're reading this after initial setup, but here
for reference):
1. Fine-grained GitHub token, scoped to just this repo, with "Actions:
   Read and write" permission.
2. cron-job.org job: POST to
   `https://api.github.com/repos/<owner>/<repo>/actions/workflows/daily-video.yml/dispatches`
   with headers `Authorization: Bearer <token>`, `Accept: application/vnd.github+json`,
   `Content-Type: application/json`, and body `{"ref":"main"}`.
3. Schedule: once daily, at your desired time, in your local timezone
   (cron-job.org lets you pick a timezone directly, no UTC math needed).

## Notes / things worth deciding before going fully public

- **Review cadence**: even with everything automated, spot-checking the first
  2-3 weeks of videos before flipping to `public` is worth the 5 minutes —
  narration pacing and caption timing can vary by script length.
- **Rate limits / cost**: edge-tts is free; YouTube's daily upload quota is
  generous for 1 video/day but check your Google Cloud quota if you ever
  batch-upload.
- **Distinct topics**: `pickTopic.js` uses the same day-of-year modulo pattern
  as your SEO pipeline. If you want the video topic to never match the same
  day's blog topic, offset the index (e.g. `dayOfYear + 7`).
- **LinkedIn video**: this version posts LinkedIn as text only. Native video
  upload to LinkedIn is possible via their Video API but needs additional
  product approval — worth adding later if text-only underperforms.
