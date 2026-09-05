// VaPlayer provider — fetches HLS streams from streamdata.vaplayer.ru
// API discovered by reverse-engineering nextgencloudfabric.com/embed/player.min.js
// GET https://streamdata.vaplayer.ru/api.php?tmdb={id}&type=movie
// GET https://streamdata.vaplayer.ru/api.php?tmdb={id}&type=tv&season={s}&episode={e}
import { BaseProvider } from '../base-provider.js';
import type { ProviderCapabilities, ProviderMediaObject, ProviderResult } from '../types.js';

const STREAM_API = 'https://streamdata.vaplayer.ru/api.php';

interface VaPlayerResponse {
    status_code: string | number;
    data?: {
        stream_urls?: string[];
        default_subs?: Array<{ file: string; label: string; default?: boolean }>;
        thumbnails_url?: string;
    };
}

export class VaPlayerProvider extends BaseProvider {
    readonly id = 'vaplayer';
    readonly name = 'VaPlayer';
    readonly enabled = true;
    readonly capabilities: ProviderCapabilities = { supportedContentTypes: ['movies', 'tv'] };

    private readonly HEADERS = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        'Referer': 'https://nextgencloudfabric.com/',
        'X-Requested-With': 'XMLHttpRequest',
        'Accept': 'application/json, text/javascript, */*; q=0.01',
    };

    async getMovieSources(media: ProviderMediaObject): Promise<ProviderResult> {
        const url = `${STREAM_API}?tmdb=${media.tmdbId}&type=movie`;
        return this.fetchSources(url, media, `https://nextgencloudfabric.com/embed/movie/${media.tmdbId}`);
    }

    async getTVSources(media: ProviderMediaObject): Promise<ProviderResult> {
        const url = `${STREAM_API}?tmdb=${media.tmdbId}&type=tv&season=${media.s}&episode=${media.e}`;
        return this.fetchSources(url, media, `https://nextgencloudfabric.com/embed/tv/${media.tmdbId}/${media.s}/${media.e}`);
    }

    private async fetchSources(apiUrl: string, media: ProviderMediaObject, referer: string): Promise<ProviderResult> {
        try {
            const res = await fetch(apiUrl, { headers: { ...this.HEADERS, 'Referer': referer }, signal: AbortSignal.timeout(8000) });
            if (!res.ok) return this.emptyResult(`HTTP ${res.status}`, media);

            const data = await res.json() as VaPlayerResponse;
            const ok = data.status_code === '200' || data.status_code === 200;
            if (!ok || !data.data?.stream_urls?.length) {
                return this.emptyResult('No streams in response', media);
            }

            const proxyHeaders = { 'User-Agent': this.HEADERS['User-Agent'], 'Referer': 'https://nextgencloudfabric.com/' };

            const sources: ProviderResult['sources'] = data.data.stream_urls.map((url, i) => ({
                url: this.createProxyUrl(url, proxyHeaders),
                type: 'hls' as const,
                quality: i === 0 ? 'Auto' : `Source ${i + 1}`,
                provider: { id: this.id, name: this.name },
            }));

            const subtitles: ProviderResult['subtitles'] = (data.data.default_subs ?? [])
                .filter(s => s.file)
                .map(s => ({
                    url: s.file,
                    label: s.label ?? 'Subtitle',
                    format: 'vtt' as const,
                }));

            return { sources, subtitles, diagnostics: [] };
        } catch (error) {
            return this.emptyResult(error instanceof Error ? error.message : 'Unknown error', media);
        }
    }

    private emptyResult(message: string, _media: ProviderMediaObject): ProviderResult {
        return {
            sources: [],
            subtitles: [],
            diagnostics: [{ code: 'PROVIDER_ERROR', message: `${this.name}: ${message}`, field: '', severity: 'error' }],
        };
    }

    async healthCheck(): Promise<boolean> {
        try {
            return (await fetch(STREAM_API, { method: 'HEAD', headers: this.HEADERS })).status < 500;
        } catch { return false; }
    }
}
