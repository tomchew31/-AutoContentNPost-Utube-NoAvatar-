# AutoContentNPost-Utube-NoAvatar

HeyGen-free version of the daily PayRecon YouTube pipeline.

**Flow:** research -> script -> edge-tts voice -> ffmpeg video -> YouTube upload

## What's already built
- `src/tts.js` — generates narration audio + captions using **edge-tts** (free, no API key)
- `src/video.js` — assembles a video from the narration audio, a static branded background image, and burned-in captions using **ffmpeg**
- `src/pipeline.js` — orchestrates the full run
- `.github/workflows/daily.yml` — triggered externally by cron-job.org, same pattern as your existing repo

## What you need to plug in
1. **`src/research.js`** — paste your existing research logic (unchanged from the HeyGen repo)
2. **`src/script.js`** — paste your existing script-generation logic. It must return `{ narration, title, description }`
3. **`src/upload.js`** — paste your existing YouTube (and LinkedIn) upload logic
4. **`assets/brand-background.png`** — add a 1920x1080 branded background image (e.g. exported from your new Canva thumbnail design, or a simpler brand card)

## Setup
```bash
npm install
cp .env.example .env
# fill in .env with your YouTube credentials
```

Requires `ffmpeg` installed locally to test (`brew install ffmpeg` / `apt install ffmpeg`). The GitHub Actions workflow installs it automatically.

## Run locally
```bash
npm start
```

## Deploy
1. Push this repo to GitHub
2. Add repo secrets: `YOUTUBE_CLIENT_ID`, `YOUTUBE_CLIENT_SECRET`, `YOUTUBE_REFRESH_TOKEN`
3. Point a cron-job.org job at:
   `POST https://api.github.com/repos/tomchew31/<repo-name>/actions/workflows/daily.yml/dispatches`
   with your GitHub PAT in the Authorization header (same setup as your existing HeyGen repo)
