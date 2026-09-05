// CinePro CF Worker — Hono-based API server
// Drop-in replacement for artifacts/api-server using Cloudflare Workers

// ─── postMessage bridge — injected into every HTML page ──────────────────────
// Lets a parent page listen for video events (ended, timeupdate) for auto-next.
const POSTMESSAGE_SCRIPT = `<script>(function(){
/* ── postMessage bridge (ended / timeupdate) ── */
function hookMessages(v){if(v._ac)return;v._ac=true;v.addEventListener('ended',function(){window.top&&window.top.postMessage({event:'ended'},'*');window.parent.postMessage({event:'ended'},'*');});v.addEventListener('timeupdate',function(){window.parent.postMessage({event:'timeupdate',time:v.currentTime,duration:v.duration||0},'*');});}

/* ── Tap-to-unmute banner ── */
var _banner=null;
function showBanner(){if(_banner||!document.body)return;_banner=document.createElement('div');_banner.style.cssText='position:fixed;top:16px;right:16px;z-index:2147483647;display:flex;align-items:center;gap:6px;background:rgba(0,0,0,0.65);backdrop-filter:blur(8px);border:1px solid rgba(255,255,255,0.2);color:rgba(255,255,255,0.8);font-size:12px;font-weight:500;padding:6px 14px;border-radius:999px;pointer-events:none;font-family:system-ui,sans-serif;';_banner.textContent='🔇 Tap to unmute';document.body.appendChild(_banner);}
function hideBanner(){if(_banner){_banner.remove();_banner=null;}}

/* ── Unmute all muted videos on first user gesture ── */
function unmuteAll(){document.querySelectorAll('video').forEach(function(v){if(v.muted){v.muted=false;if(v.paused&&!v.ended)v.play().catch(function(){});}});hideBanner();}
var _unmuteAdded=false;
function ensureUnmuteListener(){if(_unmuteAdded)return;_unmuteAdded=true;document.addEventListener('click',unmuteAll,{once:true});document.addEventListener('touchstart',unmuteAll,{once:true,passive:true});}

/* ── Check video state every 600ms, show/hide banner ── */
function checkVideos(){var muted=false;document.querySelectorAll('video').forEach(function(v){if(!v.paused&&v.muted)muted=true;});if(muted){showBanner();ensureUnmuteListener();}else{hideBanner();}}
setInterval(checkVideos,600);

/* ── Hook messages + run initial check ── */
function hookAll(){document.querySelectorAll('video').forEach(hookMessages);checkVideos();}
hookAll();
new MutationObserver(hookAll).observe(document.documentElement,{subtree:true,childList:true});
})();<\/script>`;

function injectPostMessageScript(response: Response): Response {
    const contentType = response.headers.get('content-type') ?? '';
    if (!contentType.includes('text/html')) return response;
    return new HTMLRewriter()
        .on('body', {
            element(el) {
                el.onEndTag(tag => { tag.before(POSTMESSAGE_SCRIPT, { html: true }); });
            },
        })
        .transform(response);
}

import { Hono } from 'hono';
import { cors } from 'hono/cors';
import type { Env } from './types.js';
import { BaseProvider } from './base-provider.js';
import { handleProxy } from './proxy.js';
import { validateMovie, validateTV } from './tmdb.js';
import { VidRiftProvider } from './providers/vidrift.js';
import { AnimeCurxProvider } from './providers/animecurx.js';
import { VaPlayerProvider } from './providers/vaplayer.js';
import { VidLoveProvider } from './providers/vidlove.js';
import { XPassProvider } from './providers/xpass.js';
import { MegaplayProvider } from './anime/megaplay.js';
import type { ProviderMediaObject, ProviderResult, AggregatedResult } from './types.js';
import { createToken, verifyToken } from './auth.js';

const app = new Hono<{ Bindings: Env }>();

// ─── CORS ────────────────────────────────────────────────────────────────────
app.use('*', async (c, next) => {
    const origin = c.env.CORS_ORIGIN ?? '*';
    return cors({ origin, allowMethods: ['GET', 'OPTIONS'], allowHeaders: ['Content-Type', 'Authorization'] })(c, next);
});

// ─── Bot / scraper blocker ────────────────────────────────────────────────────
// Block headless browsers, curl, wget, Python scrapers, and empty UA on API routes.
app.use('/v1/*', async (c, next) => {
    const path = new URL(c.req.url).pathname;
    // Token endpoint and proxy are handled separately
    if (path.startsWith('/v1/proxy')) return next();

    const ua = (c.req.header('User-Agent') ?? '').toLowerCase();

    // No UA at all → definitely a bot/script
    if (!ua) {
        return c.json({ error: { code: 'FORBIDDEN', message: 'Access denied' } }, 403);
    }

    const BOT_PATTERNS = [
        'curl/', 'wget/', 'python-requests', 'python-urllib',
        'go-http-client', 'java/', 'ruby/', 'php/',
        'scrapy', 'bot', 'crawl', 'spider',
        'headlesschrome', 'phantomjs', 'selenium',
        'puppeteer', 'playwright', 'axios/', 'node-fetch',
        'libwww', 'httpclient', 'okhttp',
    ];

    if (BOT_PATTERNS.some((p) => ua.includes(p))) {
        return c.json({ error: { code: 'FORBIDDEN', message: 'Access denied' } }, 403);
    }

    return next();
});

// ─── Auth middleware ──────────────────────────────────────────────────────────
// Protects all source/meta endpoints. Open paths: /v1 (health), /v1/token,
// /v1/proxy (HLS segments — hls.js cannot inject Authorization headers).
app.use('/v1/*', async (c, next) => {
    const path = new URL(c.req.url).pathname;
    if (path === '/v1' || path === '/v1/token' || path.startsWith('/v1/proxy')) {
        return next();
    }
    const secret = c.env.TOKEN_SECRET;
    if (!secret) return next(); // TOKEN_SECRET not set — open mode (dev/preview)

    const authHeader = c.req.header('Authorization') ?? '';
    if (!authHeader.startsWith('Bearer ')) {
        return c.json({ error: { code: 'UNAUTHORIZED', message: 'Missing token' } }, 401);
    }
    const token = authHeader.slice(7);
    const valid = await verifyToken(secret, token);
    if (!valid) {
        return c.json({ error: { code: 'UNAUTHORIZED', message: 'Invalid or expired token' } }, 401);
    }
    return next();
});

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Derive the worker's own base URL from the incoming request so proxy URLs are absolute. */
function getProxyBase(req: Request): string {
    const url = new URL(req.url);
    return `${url.protocol}//${url.host}`;
}

/** Instantiate all TMDB-keyed providers. */
function getProviders(): BaseProvider[] {
   return [new VidRiftProvider(), new AnimeCurxProvider(), new VaPlayerProvider(), new XPassProvider(), new VidLoveProvider()];
}

/** Run all providers in parallel with a per-provider timeout, aggregate results. */
async function aggregateSources(
    media: ProviderMediaObject,
    providers: BaseProvider[]
): Promise<AggregatedResult> {
    const eligible = providers.filter((p) => {
        const types = p.capabilities.supportedContentTypes;
        return media.type === 'movie' ? types.includes('movies') : types.includes('tv');
    });

    const results = await Promise.allSettled(
        eligible.map((p) =>
            Promise.race<ProviderResult>([
                media.type === 'movie' ? p.getMovieSources(media) : p.getTVSources(media),
                new Promise<ProviderResult>((_, reject) =>
                    setTimeout(() => reject(new Error(`${p.name} timed out`)), 8000)
                ),
            ]).catch((err): ProviderResult => ({
                sources: [],
                subtitles: [],
                diagnostics: [{ code: 'PROVIDER_ERROR', message: String(err), field: '', severity: 'error' }],
            }))
        )
    );

    const sourcesMap = new Map<string, ProviderResult['sources'][0]>();
    const subtitlesMap = new Map<string, ProviderResult['subtitles'][0]>();
    const diagnostics: ProviderResult['diagnostics'] = [];

    for (const r of results) {
        if (r.status !== 'fulfilled') continue;
        const { sources, subtitles, diagnostics: d } = r.value;
        for (const s of sources) sourcesMap.set(s.url, s);
        for (const s of subtitles) subtitlesMap.set(s.url, s);
        diagnostics.push(...d);
    }

    return {
        responseId: crypto.randomUUID(),
        expiresAt: new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString(),
        sources: [...sourcesMap.values()],
        subtitles: [...subtitlesMap.values()],
        diagnostics,
    };
}

// ─── Routes ──────────────────────────────────────────────────────────────────

// Health check — on /v1 so it doesn't conflict with the frontend home page
app.get('/v1', (c) =>
    c.json({
        name: 'CinePro',
        version: '1.0.0',
        runtime: 'cloudflare-workers',
        providers: ['vidrift', 'animecurx', 'vaplayer', 'xpass', 'megaplay'],
        status: 'ok',
    })
);

// Token endpoint — issues a short-lived signed token for the embed player.
// Only issues tokens to requests that come from allowed origins/referers.
app.get('/v1/token', async (c) => {
    // ── Referer / Origin guard ──────────────────────────────────────────────
    // Build allowed list from CORS_ORIGIN env var + always allow the worker's
    // own origin so the embed served from the worker itself always works.
    const corsOrigin = c.env.CORS_ORIGIN ?? '';
    const workerOrigin = (() => {
        const u = new URL(c.req.url);
        return `${u.protocol}//${u.host}`;
    })();

    const allowed: string[] = [workerOrigin];
    if (corsOrigin && corsOrigin !== '*') {
        corsOrigin.split(',').map((o) => o.trim()).filter(Boolean).forEach((o) => allowed.push(o));
    }

    const referer  = c.req.header('Referer')  ?? '';
    const origin   = c.req.header('Origin')   ?? '';
    const sourceHeader = referer || origin;

    // If TOKEN_SECRET is set we enforce the referer check.
    // In dev/open mode (no secret) we skip it so local testing still works.
    const secret = c.env.TOKEN_SECRET;
    if (secret && sourceHeader) {
        const ok = allowed.some((a) => sourceHeader.startsWith(a));
        if (!ok) {
            return c.json({ error: { code: 'FORBIDDEN', message: 'Access denied' } }, 403);
        }
    }

    if (!secret) {
        // Dev/open mode — return a placeholder so the embed doesn't break
        return c.json({ token: 'open', expiresAt: new Date(Date.now() + 5 * 60 * 1000).toISOString() });
    }
    const { token, expiresAt } = await createToken(secret);
    return c.json({ token, expiresAt });
});

// Movie sources
app.get('/v1/movies/:id', async (c) => {
    const proxyBase = getProxyBase(c.req.raw);
    BaseProvider.proxyBaseUrl = proxyBase;

    const tmdbId = Number(c.req.param('id'));
    if (!Number.isInteger(tmdbId) || tmdbId <= 0) {
        return c.json({ error: { code: 'INVALID_PARAMETER', message: 'tmdbId must be a positive integer' } }, 400);
    }

    const validation = await validateMovie(tmdbId, c.env.TMDB_API_KEY);
    if (!validation.exists) {
        return c.json({ error: { code: 'NOT_FOUND', message: validation.message } }, 404);
    }
    if (!validation.released) {
        return c.json({ error: { code: 'NOT_RELEASED', message: validation.message } }, 422);
    }

    const media: ProviderMediaObject = { type: 'movie', tmdbId, title: validation.title };
    const result = await aggregateSources(media, getProviders());
    return c.json(result);
});

// TV episode sources
app.get('/v1/tv/:id/seasons/:s/episodes/:e', async (c) => {
    const proxyBase = getProxyBase(c.req.raw);
    BaseProvider.proxyBaseUrl = proxyBase;

    const tmdbId = Number(c.req.param('id'));
    const season = Number(c.req.param('s'));
    const episode = Number(c.req.param('e'));

    if (!Number.isInteger(tmdbId) || tmdbId <= 0 ||
        !Number.isInteger(season) || season < 1 ||
        !Number.isInteger(episode) || episode < 1) {
        return c.json({ error: { code: 'INVALID_PARAMETER', message: 'Invalid tmdbId, season, or episode' } }, 400);
    }

    const validation = await validateTV(tmdbId, c.env.TMDB_API_KEY);
    if (!validation.exists) {
        return c.json({ error: { code: 'NOT_FOUND', message: validation.message } }, 404);
    }

    const media: ProviderMediaObject = { type: 'tv', tmdbId, s: season, e: episode, title: validation.title };
    const result = await aggregateSources(media, getProviders());
    return c.json(result);
});

// Proxy endpoint — forwards requests and rewrites HLS manifests
app.get('/v1/proxy', async (c) => {
    const proxyBase = getProxyBase(c.req.raw);
    const data = c.req.query('data');
    if (!data) {
        return c.json({ error: { code: 'MISSING_PARAMETER', message: 'Missing required parameter: data' } }, 400);
    }
    const range = c.req.header('Range') ?? c.req.header('range') ?? null;
    return handleProxy(data, range, proxyBase);
});

// Anime — MegaPlay (AniList-keyed, not TMDB)
app.get('/v1/anime/:anilistId/:episode/:audio', async (c) => {
    const proxyBase = getProxyBase(c.req.raw);
    BaseProvider.proxyBaseUrl = proxyBase;

    const { anilistId, episode, audio } = c.req.param();
    if (!/^\d+$/.test(anilistId)) return c.json({ error: { code: 'INVALID_PARAMETER', message: 'anilistId must be numeric' } }, 400);
    if (!/^\d+$/.test(episode)) return c.json({ error: { code: 'INVALID_PARAMETER', message: 'episode must be numeric' } }, 400);
    if (audio !== 'sub' && audio !== 'dub') return c.json({ error: { code: 'INVALID_PARAMETER', message: 'audio must be "sub" or "dub"' } }, 400);

    const megaplay = new MegaplayProvider();
    const result = await megaplay.getAnimeSources(anilistId, episode, audio as 'sub' | 'dub');
    if (result.sources.length === 0) {
        return c.json({
            error: { code: 'NO_SOURCES_AVAILABLE', message: result.diagnostics[0]?.message ?? 'No sources found' }
        }, 404);
    }
    return c.json({
        responseId: `anime-${anilistId}-${episode}-${audio}`,
        sources: result.sources,
        subtitles: result.subtitles,
        diagnostics: result.diagnostics,
    });
});

// Metadata endpoints — proxy TMDB so the frontend doesn't need its own key
app.get('/v1/meta/movie/:id', async (c) => {
    const tmdbKey = c.env.TMDB_API_KEY;
    if (!tmdbKey) return c.json({ error: 'TMDB_API_KEY not configured' }, 503);
    const { id } = c.req.param();
    try {
        const res = await fetch(`https://api.themoviedb.org/3/movie/${id}?api_key=${tmdbKey}`);
        if (!res.ok) return c.json({ error: 'TMDB error' }, res.status as 400);
        const d = await res.json() as { title?: string; backdrop_path?: string | null; poster_path?: string | null };
        const posterUrl = d.backdrop_path
            ? `https://image.tmdb.org/t/p/original${d.backdrop_path}`
            : d.poster_path
            ? `https://image.tmdb.org/t/p/original${d.poster_path}`
            : null;
        return c.json({ title: d.title ?? null, posterUrl });
    } catch {
        return c.json({ error: 'Failed to fetch metadata' }, 500);
    }
});

app.get('/v1/meta/tv/:id', async (c) => {
    const tmdbKey = c.env.TMDB_API_KEY;
    if (!tmdbKey) return c.json({ error: 'TMDB_API_KEY not configured' }, 503);
    const { id } = c.req.param();
    try {
        const res = await fetch(`https://api.themoviedb.org/3/tv/${id}?api_key=${tmdbKey}`);
        if (!res.ok) return c.json({ error: 'TMDB error' }, res.status as 400);
        const d = await res.json() as { name?: string; backdrop_path?: string | null; poster_path?: string | null };
        const posterUrl = d.backdrop_path
            ? `https://image.tmdb.org/t/p/original${d.backdrop_path}`
            : d.poster_path
            ? `https://image.tmdb.org/t/p/original${d.poster_path}`
            : null;
        return c.json({ title: d.name ?? null, posterUrl });
    } catch {
        return c.json({ error: 'Failed to fetch metadata' }, 500);
    }
});

// Fallback — serve embed player static assets for any non-API route.
// This makes the worker a single deployable unit: API on /v1/* and the
// React SPA on everything else, all from one workers.dev URL.
// NOTE: No X-Frame-Options / frame-ancestors restriction here — the embed is
// intentionally public so any website can iframe it.
app.notFound(async (c) => {
    // Try to serve the static file; if not found, fall back to index.html
    // so client-side routing (/movie/:id, /tv/:id) works correctly.
    const assetRes = await c.env.ASSETS.fetch(c.req.raw);
    if (assetRes.status !== 404) return injectPostMessageScript(assetRes);
    // SPA fallback — serve index.html for unknown paths
    const indexReq = new Request(new URL('/', c.req.url).toString(), c.req.raw);
    return injectPostMessageScript(await c.env.ASSETS.fetch(indexReq));
});

export default app;
