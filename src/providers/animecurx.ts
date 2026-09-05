// AnimeCurx provider — same logic as artifacts/api-server/src/providers/animecurx/animecurx.ts
// Only change: import from local base-provider instead of @omss/framework
import { BaseProvider } from '../base-provider.js';
import type { ProviderCapabilities, ProviderMediaObject, ProviderResult } from '../types.js';

interface AnimeCurxStream { index: number; label: string; url: string; }

export class AnimeCurxProvider extends BaseProvider {
    readonly id = 'animecurx';
    readonly name = 'AnimeCurx';
    // Disabled: currently slow/unreliable, adds latency before faster providers respond
    readonly enabled = false;
    readonly BASE_URL = 'https://embed.animecurx.tech';
    readonly HEADERS = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150 Safari/537.36',
        'Referer': 'https://embed.animecurx.tech/',
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
    };
    readonly capabilities: ProviderCapabilities = { supportedContentTypes: ['movies', 'tv'] };

    async getMovieSources(media: ProviderMediaObject): Promise<ProviderResult> {
        return this.getSources(`${this.BASE_URL}/embed/movie/${media.tmdbId}`, media);
    }
    async getTVSources(media: ProviderMediaObject): Promise<ProviderResult> {
        return this.getSources(`${this.BASE_URL}/embed/tv/${media.tmdbId}/${media.s}/${media.e}`, media);
    }

    private async getSources(url: string, media: ProviderMediaObject): Promise<ProviderResult> {
        try {
            const res = await fetch(url, { headers: this.HEADERS, signal: AbortSignal.timeout(1500) });
            if (!res.ok) return this.emptyResult(`HTTP ${res.status}`, media);
            const html = await res.text();
            const match = html.match(/var\s+streams\s*=\s*(\[[\s\S]*?\]);/);
            if (!match) return this.emptyResult('No streams found', media);
            let streams: AnimeCurxStream[];
            try { streams = JSON.parse(match[1]); } catch { return this.emptyResult('Failed to parse streams', media); }
            if (!streams.length) return this.emptyResult('Empty streams', media);
            const proxyHeaders = { 'User-Agent': this.HEADERS['User-Agent'], 'Referer': this.BASE_URL + '/' };
            const sources: ProviderResult['sources'] = streams.map((s) => ({
                url: this.createProxyUrl(s.url, proxyHeaders),
                type: 'hls' as const,
                quality: s.label ?? `Source ${s.index + 1}`,
                audioTracks: [{ label: 'English', language: 'eng' }],
                provider: { id: this.id, name: this.name },
            }));
            return { sources, subtitles: [], diagnostics: [] };
        } catch (error) {
            return this.emptyResult(error instanceof Error ? error.message : 'Unknown error', media);
        }
    }

    private emptyResult(message: string, _media: ProviderMediaObject): ProviderResult {
        return { sources: [], subtitles: [], diagnostics: [{ code: 'PROVIDER_ERROR', message: `${this.name}: ${message}`, field: '', severity: 'error' }] };
    }

    async healthCheck(): Promise<boolean> {
        try { return (await fetch(this.BASE_URL, { method: 'HEAD', headers: this.HEADERS })).status < 500; } catch { return false; }
    }
}
