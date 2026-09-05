// VidLove provider — same logic as artifacts/api-server/src/providers/vidlove/vidlove.ts
// Only change: imports from local base-provider/types instead of @omss/framework
import { BaseProvider } from '../base-provider.js';
import type { ProviderCapabilities, ProviderMediaObject, ProviderResult } from '../types.js';

const API_BASE = 'https://ballerinacappuccinalovestungtungtungsahur.com';

interface VidLoveSubtitle { label: string; file: string; type: 'vtt' | 'srt'; source: string; }
interface VidLoveSource { source: string; label: string; url: string; manifest?: string; }
interface VidLoveResponse { meta?: Record<string, unknown>; subtitles: VidLoveSubtitle[]; source: VidLoveSource | null; }

export class VidLoveProvider extends BaseProvider {
    readonly id = 'vidlove';
    readonly name = 'VidLove';
    readonly enabled = true;
    readonly BASE_URL = API_BASE;
    readonly HEADERS = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        Accept: 'application/json, */*',
        'Accept-Language': 'en-US,en;q=0.9',
        Referer: 'https://vidlove.cc/',
        Origin: 'https://vidlove.cc',
    };
    readonly capabilities: ProviderCapabilities = { supportedContentTypes: ['movies', 'tv'] };

    async getMovieSources(media: ProviderMediaObject): Promise<ProviderResult> { return this.getSources(media); }
    async getTVSources(media: ProviderMediaObject): Promise<ProviderResult> { return this.getSources(media); }

    private async getSources(media: ProviderMediaObject): Promise<ProviderResult> {
        try {
            const path = media.type === 'movie'
                ? `/movie?id=${media.tmdbId}&mode=json`
                : `/tv?id=${media.tmdbId}&season=${media.s}&episode=${media.e}&mode=json`;

            const res = await fetch(`${API_BASE}${path}`, { headers: this.HEADERS });
            if (!res.ok) throw new Error(`API returned ${res.status}`);

            const data = await res.json() as VidLoveResponse;
            if (!data.source?.url) throw new Error('No source URL in API response');

            const sources: ProviderResult['sources'] = [{
                url: this.createProxyUrl(data.source.url, this.HEADERS),
                type: 'hls',
                quality: 'Auto',
                audioTracks: [{ label: 'English', language: 'eng' }],
                provider: { id: this.id, name: this.name },
            }];

            const subtitles: ProviderResult['subtitles'] = (data.subtitles ?? [])
                .filter(s => s.file && (s.type === 'vtt' || s.type === 'srt'))
                .map(s => ({
                    url: s.file,
                    label: s.label,
                    format: s.type === 'srt' ? 'srt' as const : 'vtt' as const,
                }));

            return { sources, subtitles, diagnostics: [] };
        } catch (error) {
            return this.emptyResult(error instanceof Error ? error.message : 'Unknown error', media);
        }
    }

    private emptyResult(message: string, _media: ProviderMediaObject): ProviderResult {
        return { sources: [], subtitles: [], diagnostics: [{ code: 'PROVIDER_ERROR', message: `${this.name}: ${message}`, field: '', severity: 'error' }] };
    }

    async healthCheck(): Promise<boolean> {
        try { return (await fetch(API_BASE, { method: 'HEAD', headers: this.HEADERS })).status < 500; } catch { return false; }
    }
}
