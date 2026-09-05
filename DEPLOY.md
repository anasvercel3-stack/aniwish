# Deploying CinePro to Cloudflare Workers + Pages

## Prerequisites
- A free Cloudflare account at https://cloudflare.com
- Deploy straight from this Replit terminal — no local setup needed

---

## 1. Authenticate Wrangler

```bash
cd artifacts/cf-worker
./node_modules/.bin/wrangler login
```

This opens a browser tab to authorize your Cloudflare account.

---

## 2. Set your TMDB API key as a secret

```bash
./node_modules/.bin/wrangler secret put TMDB_API_KEY
# Paste your key when prompted
```

---

## 3. Deploy the Worker

```bash
./node_modules/.bin/wrangler deploy
```

Wrangler prints your worker URL, e.g.:
```
https://cinepro-api.<your-subdomain>.workers.dev
```

**Copy that URL** — you need it for Step 4.

---

## 4. Build the Embed Player

Run this from the workspace root, replacing the URL with your actual worker URL:

```bash
cd /home/runner/workspace

VITE_OMSS_URL=https://cinepro-api.<your-subdomain>.workers.dev \
  BASE_PATH=/ PORT=3000 TMDB_API_KEY=placeholder \
  pnpm --filter @workspace/embed run build
```

The built files land in `artifacts/embed/dist/public/`.

---

## 5. Deploy the Embed Player to Cloudflare Pages

In the **Cloudflare dashboard**:
1. Go to **Workers & Pages → Create → Pages → Upload assets**
2. Name your project (e.g. `cinepro-embed`)
3. Upload the `artifacts/embed/dist/public/` folder
4. Click **Deploy**

Your embed player URL will be something like:
```
https://cinepro-embed.pages.dev
```

Use it as: `https://cinepro-embed.pages.dev/movie/299536` or `/tv/1396/1/1`

---

## API routes

| Method | Path | Description |
|--------|------|-------------|
| GET | `/` | Health check |
| GET | `/v1/movies/:tmdbId` | Movie stream sources + subtitles |
| GET | `/v1/tv/:tmdbId/seasons/:s/episodes/:e` | TV episode sources + subtitles |
| GET | `/v1/proxy?data=...` | Proxy + HLS manifest rewriter |
| GET | `/v1/anime/:anilistId/:episode/:sub\|dub` | Anime sources (MegaPlay) |

---

## Subtitle source

Subtitles come from `sub.1x2.space` — a TMDB-keyed VTT API. No extra configuration needed; it's built into the VidRift provider and works automatically for both movies and TV.

---

## Free tier limits (Cloudflare)

| Resource | Free allowance |
|---|---|
| Worker requests | 100,000 / day |
| CPU time | 10ms / request |
| Cache API | Unlimited reads/writes |
| Pages bandwidth | Unlimited |

Well within limits for personal use.

---

## Re-deploying after code changes

```bash
# Worker only
cd artifacts/cf-worker && ./node_modules/.bin/wrangler deploy

# Embed only — rebuild then re-upload dist/public/ to Pages
cd /home/runner/workspace
VITE_OMSS_URL=https://cinepro-api.<your-subdomain>.workers.dev \
  BASE_PATH=/ PORT=3000 TMDB_API_KEY=placeholder \
  pnpm --filter @workspace/embed run build
```
