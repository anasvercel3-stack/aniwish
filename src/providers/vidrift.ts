// VidRift provider — same logic as artifacts/api-server/src/providers/vidrift/vidrift.ts
// Only change: import from local base-provider instead of @omss/framework
import { BaseProvider } from '../base-provider.js';
import type { ProviderCapabilities, ProviderMediaObject, ProviderResult } from '../types.js';

const VR_SECRET = 'vr_sec_v2_9kL8mN4qR2tX';
const VR_SOURCES = ['embed'] as const;

// sub.1x2.space — TMDB-keyed VTT subtitle API used by play.xpass.top
const SUB_BASE = 'https://sub.1x2.space';

interface Sub1x2Entry { label: string; language: string; status: string; url: string; size?: number; }
interface VidRiftStream { index: number; url: string; proxyUrl?: string; label?: string; quality?: string; }
interface VidRiftSourceResponse { success: boolean; sourceType?: 'hls' | 'mp4'; streams?: VidRiftStream[]; }

function vrHash(s: string): string {
    let h = 0;
    for (let i = 0; i < s.length; i++) { h = (h << 5) - h + s.charCodeAt(i); h |= 0; }
    return Math.abs(h).toString(36).padStart(8, '0');
}
function vrToken(): string {
    const t = Math.floor(Date.now() / 1000);
    return `${t}-${vrHash(`${t}:${VR_SECRET}`)}`;
}

export class VidRiftProvider extends BaseProvider {
    readonly id = 'vidrift';
    readonly name = 'VidRift';
    readonly enabled = true;
    readonly BASE_URL = 'https://vidrift.in';
    readonly HEADERS = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150 Safari/537.36',
        Accept: 'application/json, text/html, */*; q=0.01',
        'Accept-Language': 'en-US,en;q=0.9',
    };
    readonly capabilities: ProviderCapabilities = { supportedContentTypes: ['movies', 'tv'] };

    async getMovieSources(media: ProviderMediaObject): Promise<ProviderResult> { return this.getSources(media); }
    async getTVSources(media: ProviderMediaObject): Promise<ProviderResult> { return this.getSources(media); }

    private async getSources(media: ProviderMediaObject): Promise<ProviderResult> {
        try {
            const headers = { ...this.HEADERS };
            const [streamResults, subtitles] = await Promise.all([
                Promise.allSettled(VR_SOURCES.map((src) => this.fetchSource(media, src, headers))),
                this.fetchSubtitlesFrom1x2(media),
            ]);
            const sources: ProviderResult['sources'] = [];
            for (const r of streamResults) {
                if (r.status === 'fulfilled' && r.value) sources.push(...r.value);
            }
            if (sources.length === 0 && subtitles.length === 0) throw new Error('No streams returned');
            return { sources, subtitles, diagnostics: [] };
        } catch (error) {
            return this.emptyResult(error instanceof Error ? error.message : 'Unknown error', media);
        }
    }

    private async fetchSource(media: ProviderMediaObject, source: string, headers: Record<string, string>): Promise<ProviderResult['sources'] | null> {
        const token = vrToken();
        const path = media.type === 'movie'
            ? `/api/source/movie/${media.tmdbId}?_t=${token}&source=${source}`
            : `/api/source/tv/${media.tmdbId}/${media.s}/${media.e}?_t=${token}&source=${source}`;
        const res = await fetch(`${this.BASE_URL}${path}`, { headers });
        if (!res.ok) return null;
        const data = await res.json() as VidRiftSourceResponse;
        if (!data.success || !data.streams?.length) return null;
        const type: 'hls' | 'mp4' = data.sourceType === 'mp4' ? 'mp4' : 'hls';
        return data.streams.map((s) => ({
            url: this.createProxyUrl(s.url, headers),
            type,
            quality: s.label ?? s.quality ?? 'Auto',
            audioTracks: [{ label: 'English', language: 'eng' }],
            provider: { id: this.id, name: this.name },
        }));
    }

    /**
     * Fetches subtitles from sub.1x2.space — a TMDB-keyed VTT subtitle API.
     * Movie:  GET https://sub.1x2.space/api/movie/{tmdbId}
     * TV:     GET https://sub.1x2.space/api/tv/{tmdbId}/{season}/{episode}
     * Only entries with status "cached" have a real file; skip "failed" ones.
     * VTT files are served with access-control-allow-origin: * — no proxy needed.
     */
    private async fetchSubtitlesFrom1x2(media: ProviderMediaObject): Promise<ProviderResult['subtitles']> {
        try {
            const path = media.type === 'movie'
                ? `/api/movie/${media.tmdbId}`
                : `/api/tv/${media.tmdbId}/${media.s}/${media.e}`;
            const res = await fetch(`${SUB_BASE}${path}`, {
                headers: { 'User-Agent': this.HEADERS['User-Agent'] },
            });
            if (!res.ok) return [];
            const entries = await res.json() as Sub1x2Entry[];
            if (!Array.isArray(entries) || !entries.length) return [];
            return entries
                .filter((e) => e.status === 'cached' && e.url)
                .map((e) => ({
                    url: `${SUB_BASE}${e.url}`,
                    label: e.label,
                    format: 'vtt' as const,
                }));
        } catch { return []; }
    }

    private emptyResult(message: string, _media: ProviderMediaObject): ProviderResult {
        return { sources: [], subtitles: [], diagnostics: [{ code: 'PROVIDER_ERROR', message: `${this.name}: ${message}`, field: '', severity: 'error' }] };
    }

    async healthCheck(): Promise<boolean> {
        try { return (await fetch(this.BASE_URL, { method: 'HEAD', headers: this.HEADERS })).status < 500; } catch { return false; }
    }
}
