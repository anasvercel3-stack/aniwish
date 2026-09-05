// MegaPlay provider — same logic as artifacts/api-server/src/anime/megaplay.ts
// Only change: import from local base-provider instead of @omss/framework
import { BaseProvider } from '../base-provider.js';
import type { ProviderCapabilities, ProviderMediaObject, ProviderResult } from '../types.js';

const STREAM_REFERER = 'https://hianime.to/';
const CDN_REFERER = 'https://megaplay.buzz/';
const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150 Safari/537.36';

interface MegaplaySourcesResponse {
    sources?: { file?: string };
    tracks?: Array<{ file?: string; label?: string; kind?: string; default?: boolean }>;
}

export type MegaplayAudio = 'sub' | 'dub';

export class MegaplayProvider extends BaseProvider {
    readonly id = 'megaplay';
    readonly name = 'MegaPlay';
    readonly enabled = true;
    readonly BASE_URL = 'https://megaplay.buzz';
    readonly HEADERS = {
        'User-Agent': USER_AGENT,
        'Accept-Language': 'en-US,en;q=0.9',
    };
    readonly capabilities: ProviderCapabilities = { supportedContentTypes: [] };

    async getMovieSources(_media: ProviderMediaObject): Promise<ProviderResult> {
        return { sources: [], subtitles: [], diagnostics: [] };
    }
    async getTVSources(_media: ProviderMediaObject): Promise<ProviderResult> {
        return { sources: [], subtitles: [], diagnostics: [] };
    }

    async getAnimeSources(anilistId: string, episode: string, audio: MegaplayAudio): Promise<ProviderResult> {
        try {
            const streamUrl = `${this.BASE_URL}/stream/ani/${anilistId}/${episode}/${audio}`;
            const embedRes = await fetch(streamUrl, { headers: { ...this.HEADERS, Referer: STREAM_REFERER } });
            if (!embedRes.ok) throw new Error(`Embed page returned ${embedRes.status}`);
            const html = await embedRes.text();
            const idMatch = html.match(/data-id="(\d+)"/);
            if (!idMatch) throw new Error('No episode found for this AniList ID / episode / audio combination');
            const fileId = idMatch[1];

            const sourcesRes = await fetch(`${this.BASE_URL}/stream/getSources?id=${fileId}`, {
                headers: { ...this.HEADERS, Referer: streamUrl, 'X-Requested-With': 'XMLHttpRequest' },
            });
            if (!sourcesRes.ok) throw new Error(`getSources returned ${sourcesRes.status}`);
            const data = await sourcesRes.json() as MegaplaySourcesResponse;
            const file = data.sources?.file;
            if (!file) throw new Error('No stream file in getSources response');

            const cdnHeaders = { 'User-Agent': USER_AGENT, Referer: CDN_REFERER };
            const sources: ProviderResult['sources'] = [{
                url: this.createProxyUrl(file, cdnHeaders),
                type: 'hls',
                quality: 'Auto',
                audioTracks: [audio === 'dub' ? { label: 'English', language: 'eng' } : { label: 'Japanese', language: 'jpn' }],
                provider: { id: this.id, name: this.name },
            }];
            const subtitles: ProviderResult['subtitles'] = (data.tracks ?? [])
                .filter((t) => t.kind === 'captions' && !!t.file)
                .map((t) => ({
                    url: this.createProxyUrl(t.file as string, cdnHeaders),
                    label: t.label ?? 'English',
                    format: 'vtt' as const,
                }));
            return { sources, subtitles, diagnostics: [] };
        } catch (error) {
            return {
                sources: [], subtitles: [],
                diagnostics: [{ code: 'PROVIDER_ERROR', message: `${this.name}: ${error instanceof Error ? error.message : 'Unknown error'}`, field: '', severity: 'error' }],
            };
        }
    }

    async healthCheck(): Promise<boolean> {
        try { return (await fetch(this.BASE_URL, { method: 'HEAD', headers: this.HEADERS })).status < 500; } catch { return false; }
    }
}
