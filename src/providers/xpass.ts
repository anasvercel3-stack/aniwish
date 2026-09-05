// XPass provider — fetches HLS/MP4 streams from play.xpass.top embed pages.
// Movie: https://play.xpass.top/e/movie/{tmdbId}
// TV:    https://play.xpass.top/e/tv/{tmdbId}/{season}/{episode}
import { BaseProvider } from '../base-provider.js';
import type { ProviderCapabilities, ProviderMediaObject, ProviderResult } from '../types.js';
import {
    fetchXpassEmbedHtml,
    extractXpassBackups,
    fetchXpassSources,
} from '../utils/xpass-resolver.js';

const XPASS_BASE = 'https://play.xpass.top';

export class XPassProvider extends BaseProvider {
    readonly id = 'xpass';
    readonly name = 'XPass';
    readonly enabled = true;

    readonly HEADERS = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
    };

    readonly capabilities: ProviderCapabilities = {
        supportedContentTypes: ['movies', 'tv'],
    };

    async getMovieSources(media: ProviderMediaObject): Promise<ProviderResult> {
        return this.getSources(`${XPASS_BASE}/e/movie/${media.tmdbId}`, media);
    }

    async getTVSources(media: ProviderMediaObject): Promise<ProviderResult> {
        return this.getSources(`${XPASS_BASE}/e/tv/${media.tmdbId}/${media.s}/${media.e}`, media);
    }

    private async getSources(embedUrl: string, media: ProviderMediaObject): Promise<ProviderResult> {
        try {
            const html = await fetchXpassEmbedHtml(embedUrl, this.HEADERS);
            if (!html) return this.emptyResult('Failed to fetch embed page', media);

            const backups = extractXpassBackups(html);
            if (!backups.length) return this.emptyResult('No backup sources in embed page', media);

            const proxyHeaders = {
                'User-Agent': this.HEADERS['User-Agent'],
                Referer: `${XPASS_BASE}/`,
            };

            // Fetch up to 5 backups in parallel
            const results = await Promise.allSettled(
                backups.slice(0, 5).map((b) => fetchXpassSources(b, proxyHeaders))
            );

            const sources: ProviderResult['sources'] = [];
            for (const r of results) {
                if (r.status !== 'fulfilled') continue;
                for (const s of r.value) {
                    sources.push({
                        url: this.createProxyUrl(s.url, proxyHeaders),
                        type: s.type,
                        quality: s.quality,
                        audioTracks: [{ label: 'English', language: 'eng' }],
                        provider: { id: this.id, name: this.name },
                    });
                }
            }

            if (!sources.length) return this.emptyResult('All backup playlists returned empty', media);
            return { sources, subtitles: [], diagnostics: [] };
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
            return (await fetch(XPASS_BASE, { method: 'HEAD', headers: this.HEADERS })).status < 500;
        } catch { return false; }
    }
}
